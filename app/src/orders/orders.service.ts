import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import {
  ProcessedMessage,
  ProcessedMessageStatus,
} from '../idempotency/processed-message.entity';
import { createHash } from 'crypto';
import { UsersService } from 'src/users/users.service';
import { UserNotFoundError } from 'src/common/errors/domain.errors';
import {
  ORDER_CREATE_SCOPE,
  ORDER_MAX_RETRIES,
} from 'src/common/constants/order';

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) { }

  async createOrder(
    userId: string,
    items: CreateOrderItemInput[],
    idempotencyKey: string,
  ): Promise<CreateOrderResponseDto> {
    const user = await this.requireUser(userId);
    const productMap = this.buildProductMap(items);
    await this.ensureProductsExist(productMap);

    const result = await this.dataSource.transaction(async (manager) => {
      const hash = this.buildRequestHash(userId, items);

      const replay = await this.claimIdempotencyOrReplay({
        manager,
        idempotencyKey,
        hash,
      });
      if (replay) return replay;

      const order = await this.createPendingOrder(manager, user);
      await this.reserveStockAndCreateItems(manager, order, productMap);
      await this.finalizeIdempotency(manager, {
        idempotencyKey,
        orderId: order.id,
      });

      return this.loadOrderForResponse(manager, order.id);
    });

    return this.toCreateOrderResponse(result);
  }

  async findById(id: string): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { id },
      relations: { user: true, items: { product: true } },
    });
  }

  async findAll(): Promise<Order[]> {
    return this.ordersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.ordersRepository.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }

  private buildProductMap(items: CreateOrderItemInput[]): Map<string, number> {
    const productMap = new Map<string, number>();
    for (const item of items) {
      productMap.set(
        item.productId,
        (productMap.get(item.productId) || 0) + item.quantity,
      );
    }
    return productMap;
  }

  private async ensureProductsExist(
    productMap: Map<string, number>,
  ): Promise<void> {
    const productIds = Array.from(productMap.keys());
    const products = await this.productsRepository.find({
      where: { id: In(productIds) },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }
  }

  private buildRequestHash(userId: string, items: CreateOrderItemInput[]): string {
    const aggregated = new Map<string, number>();
    for (const item of items) {
      aggregated.set(item.productId, (aggregated.get(item.productId) ?? 0) + item.quantity);
    }
    const normalizedItems = Array.from(aggregated.entries())
      .map(([productId, quantity]) => ({ productId, quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId));

    const payload = { userId, items: normalizedItems };

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private async claimIdempotencyOrReplay({
    manager,
    idempotencyKey,
    hash,
  }: {
    manager: EntityManager;
    idempotencyKey: string;
    hash: string;
  }): Promise<Order | undefined> {
    const orderRepository = manager.getRepository(Order);
    const processedMessageRepository = manager.getRepository(ProcessedMessage);
    const processedMessage = await processedMessageRepository
      .createQueryBuilder()
      .insert()
      .into(ProcessedMessage)
      .values({
        scope: ORDER_CREATE_SCOPE,
        idempotencyKey,
        requestHash: hash,
        status: ProcessedMessageStatus.PENDING,
      })
      .orIgnore()
      .returning('id')
      .execute();

    const claimed = (processedMessage.raw?.length ?? 0) > 0;
    if (!claimed) {
      const existing = await processedMessageRepository.findOne({
        where: { scope: ORDER_CREATE_SCOPE, idempotencyKey },
      });
      if (!existing) {
        throw new ConflictException('Idempotency conflict, retry');
      }
      if (existing.requestHash !== hash) {
        throw new ConflictException(
          'Idempotency key reused with different payload',
        );
      }
      if (
        existing.status === ProcessedMessageStatus.PROCESSED &&
        existing.resourceId
      ) {
        const order = await orderRepository.findOne({
          where: { id: existing.resourceId },
          relations: { items: { product: true }, user: true },
        });
        if (order) return order;
      }
      throw new ConflictException('Request is already processing, retry');
    }
  }

  private async createPendingOrder(
    manager: EntityManager,
    user: User,
  ): Promise<Order> {
    const order = manager.create(Order, {
      userId: user.id,
      user,
      status: OrderStatus.PENDING,
    });
    return await manager.save(order);
  }

  private async reserveStockAndCreateItems(
    manager: EntityManager,
    order: Order,
    productMap: Map<string, number>,
  ): Promise<void> {
    const productRepository = manager.getRepository(Product);
    const orderItemRepository = manager.getRepository(OrderItem);

    const retries = ORDER_MAX_RETRIES;
    for (const [productId, quantity] of productMap.entries()) {
      let updated = false;
      for (let attempt = 1; attempt <= retries; attempt++) {
        const product = await productRepository.findOne({
          where: { id: productId },
        });
        if (!product) throw new NotFoundException('Product not found');
        if (product.stock < quantity) {
          throw new BadRequestException({
            code: 'OUT_OF_STOCK',
            message: 'Insufficient stock',
            details: {
              productId,
              requested: quantity,
              available: product.stock,
            },
          });
        }
        const res = await manager
          .createQueryBuilder()
          .update(Product)
          .set({
            stock: () => 'stock - :quantity',
            version: () => 'version + 1',
          })
          .where('id = :id', { id: productId })
          .andWhere('version = :version', { version: product.version })
          .andWhere('stock >= :quantity', { quantity })
          .execute();
        if ((Number(res.affected) || 0) > 0) {
          // stock reserved successfully
          const orderItem = orderItemRepository.create({
            orderId: order.id,
            order,
            productId: product.id,
            product,
            quantity,
            priceAtPurchase: product.price,
          });
          await orderItemRepository.save(orderItem);
          updated = true;
          break;
        }
      }
      if (!updated) {
        throw new ConflictException({
          code: 'CONCURRENT_UPDATE',
          message: 'Concurrent inventory update, please retry',
          details: { productId },
        });
      }
    }
  }

  private async finalizeIdempotency(
    manager: EntityManager,
    { idempotencyKey, orderId }: { idempotencyKey: string; orderId: string },
  ): Promise<void> {
    const processedMessageRepository = manager.getRepository(ProcessedMessage);
    await processedMessageRepository.update(
      { idempotencyKey, scope: ORDER_CREATE_SCOPE },
      { status: ProcessedMessageStatus.PROCESSED, resourceId: orderId },
    );
  }

  private async loadOrderForResponse(
    manager: EntityManager,
    orderId: string,
  ): Promise<Order> {
    const orderRepository = manager.getRepository(Order);
    const order = await orderRepository.findOne({
      where: { id: orderId },
      relations: { items: { product: true }, user: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private toCreateOrderResponse(order: Order): CreateOrderResponseDto {
    return {
      order: {
        id: order.id,
        userId: order.userId,
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        status: order.status,
        createdAt: order.createdAt,
      },
    };
  }
}
