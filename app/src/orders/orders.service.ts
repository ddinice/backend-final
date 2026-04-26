import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async createOrder(
    userId: string,
    items: CreateOrderItemInput[],
    idempotencyKey: string,
  ): Promise<CreateOrderResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const productMap = new Map<string, number>();
    for (const item of items) {
      productMap.set(
        item.productId,
        (productMap.get(item.productId) || 0) + item.quantity,
      );
    }

    const products = await this.productsRepository.find({
      where: { id: In([...productMap.keys()]) },
    });

    if (products.length !== productMap.size) {
      throw new NotFoundException('One or more products were not found');
    }

    const orderTransaction = await this.dataSource.transaction(
      async (manager) => {
        const orderRepository = manager.getRepository(Order);
        const orderItemRepository = manager.getRepository(OrderItem);
        const productRepository = manager.getRepository(Product);
        const processedMessageRepository =
          manager.getRepository(ProcessedMessage);

        const payloadForHash = {
          userId,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };
        const requestHash = createHash('sha256')
          .update(JSON.stringify(payloadForHash))
          .digest('hex');

        const processedMessage = await processedMessageRepository
          .createQueryBuilder()
          .insert()
          .into(ProcessedMessage)
          .values({
            scope: 'orders.create',
            idempotencyKey,
            requestHash,
            status: ProcessedMessageStatus.PENDING,
          })
          .orIgnore()
          .returning('id')
          .execute();

        const claimed = (processedMessage.raw?.length ?? 0) > 0;
        if (!claimed) {
          const existing = await processedMessageRepository.findOne({
            where: { scope: 'orders.create', idempotencyKey },
          });
          if (!existing) {
            throw new ConflictException('Idempotency conflict, retry');
          }
          if (existing.requestHash !== requestHash) {
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

        const order = orderRepository.create({
          userId: user.id,
          user,
          status: OrderStatus.PENDING,
        });
        await orderRepository.save(order);

        const MAX_RETRIES = 3;
        for (const [productId, quantity] of productMap.entries()) {
          let updated = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

        await processedMessageRepository.update(
          { idempotencyKey, scope: 'orders.create' },
          {
            status: ProcessedMessageStatus.PROCESSED,
            resourceId: order.id,
          },
        );

        const createdOrder = await orderRepository.findOne({
          where: { id: order.id },
          relations: { items: { product: true }, user: true },
        });
        if (!createdOrder)
          throw new BadRequestException('Order creation failed');

        return createdOrder;
      },
    );
    return {
      order: {
        id: orderTransaction.id,
        userId: orderTransaction.userId,
        items: orderTransaction.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        status: orderTransaction.status,
        createdAt: orderTransaction.createdAt,
      },
    };
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
}
