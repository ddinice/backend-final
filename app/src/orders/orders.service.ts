import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { OrdersProcessMessage } from './orders-queue.types';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { randomUUID } from 'crypto';
import {
  ORDERS_EXCHANGE,
  ORDERS_PROCESS_ROUTING_KEY,
} from 'src/rabbitmq/rabbitmq.constants';

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
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async createOrder(
    userId: string,
    items: CreateOrderItemInput[],
  ): Promise<Order> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = Array.from(new Set(productIds));
    const products = await this.productsRepository.find({
      where: { id: In(uniqueProductIds) },
    });

    if (products.length !== uniqueProductIds.length) {
      throw new Error('One or more products were not found');
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const created = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(Order);
      const orderItemRepository = manager.getRepository(OrderItem);

      const order = orderRepository.create({
        userId: user.id,
        user,
        status: OrderStatus.PENDING,
      });
      await orderRepository.save(order);

      const orderItems = items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new Error('Product not found');
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

      const createdOrder = await orderRepository.findOne({
        where: { id: order.id },
        relations: { user: true, items: { product: true } },
      });

      if (!createdOrder) {
        throw new Error('Order creation failed');
      }

      return createdOrder;
    });

    const message: OrdersProcessMessage = {
      messageId: randomUUID(),
      orderId: created.id,
      attempt: 0,
      createdAt: new Date().toISOString(),
      correlationId: created.id,
      producer: 'orders-api',
      eventName: 'orders.process.requested',
    };

    const published = this.rabbitmqService.publishToExchange(
      ORDERS_EXCHANGE,
      ORDERS_PROCESS_ROUTING_KEY,
      message,
      {
        messageId: message.messageId,
        correlationId: message.correlationId,
        headers: {
          messageId: message.messageId,
          orderId: message.orderId,
          attempt: message.attempt,
        },
      },
    );

    if (!published) {
      this.logger.error(
        `Failed to publish order processing message: orderId=${created.id} messageId=${message.messageId}`,
      );
      throw new ServiceUnavailableException(
        'Order was created but not queued for processing. Please retry later.',
      );
    }

    return created;
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
