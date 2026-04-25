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
    @InjectRepository(ProcessedMessage)
    private readonly processedMessagesRepository: Repository<ProcessedMessage>,
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

    if (idempotencyKey) {
      const existing = await this.processedMessagesRepository.findOne({
        where: { scope: 'orders.create', idempotencyKey },
      });
      console.log('processedMessage', existing);

      if (existing) {
        const payload = {
          userId,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };
        const payloadForHashString = JSON.stringify(payload);
        const requestHash = createHash('sha256')
          .update(payloadForHashString)
          .digest('hex');
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 409,
            message: 'Idempotency key reused with different payload',
          });
        }

        const order = await this.ordersRepository.findOne({
          where: { id: existing.resourceId },
          relations: { items: { product: true } },
        });
        if (!order) {
          throw new NotFoundException('Order not found');
        }

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

    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = Array.from(new Set(productIds));
    const products = await this.productsRepository.find({
      where: { id: In(uniqueProductIds) },
    });

    if (products.length !== uniqueProductIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const orderTransaction = await this.dataSource.transaction(
      async (manager) => {
        const orderRepository = manager.getRepository(Order);
        const orderItemRepository = manager.getRepository(OrderItem);
        const processedMessageRepository =
          manager.getRepository(ProcessedMessage);

        const order = orderRepository.create({
          userId: user.id,
          user,
          status: OrderStatus.PENDING,
        });
        await orderRepository.save(order);
        const payloadForHash = {
          userId,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };

        const orderItems = items.map((item) => {
          const product = productsById.get(item.productId);
          if (!product) {
            throw new NotFoundException('Product not found');
          }

          return orderItemRepository.create({
            orderId: order.id,
            order,
            productId: product.id,
            product,
            quantity: item.quantity,
            priceAtPurchase: product.price,
          });
        });

        await orderItemRepository.save(orderItems);

        // Create processed message for the order
        const payloadForHashString = JSON.stringify(payloadForHash);
        const requestHash = createHash('sha256')
          .update(payloadForHashString)
          .digest('hex');
        const processedMessage = await processedMessageRepository.create({
          scope: 'orders.create',
          idempotencyKey,
          requestHash,
          resourceId: order.id,
          status: ProcessedMessageStatus.PENDING,
        });
        await processedMessageRepository.save(processedMessage);

        const createdOrder = await orderRepository.findOne({
          where: { id: order.id },
          relations: { items: { product: true }, user: true },
        });
        if (!createdOrder)
          throw new BadRequestException('Order creation failed');

        await processedMessageRepository.update(
          {
            scope: 'orders.create',
            idempotencyKey,
            resourceId: order.id,
          },
          {
            status: ProcessedMessageStatus.PROCESSED,
          },
        );
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
