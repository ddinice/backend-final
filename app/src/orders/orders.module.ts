import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from 'src/products/product.entity';
import { User } from 'src/users/user.entity';
import { RabbitmqModule } from 'src/rabbitmq/rabbitmq.module';
import { ProcessedMessage } from './entities/processed-message.entity';
import { OrdersWorkerService } from './orders-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      User,
      ProcessedMessage,
    ]),
    RabbitmqModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersWorkerService],
})
export class OrdersModule {}
