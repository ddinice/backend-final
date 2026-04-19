import {
  BadRequestException,
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
  ): Promise<CreateOrderResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
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

      const createdOrder = await orderRepository.findOne({
        where: { id: order.id },
        relations: { user: true, items: { product: true } },
      });

      if (!createdOrder) {
        throw new BadRequestException('Order creation failed');
      }

      return createdOrder;
    });


    return {
      order: {
        id: created.id,
        userId: created.userId,
        items: created.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        status: created.status,
        createdAt: created.createdAt,
      }
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
