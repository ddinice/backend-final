import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from 'src/products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ProcessedMessage } from '../idempotency/processed-message.entity';
import { UsersModule } from 'src/users/users.module';
import { RabbitmqModule } from 'src/rabbitmq/rabbitmq.module';
import { OrdersWorkerService } from './orders-worker.service';
import { PaymentsClientModule } from 'src/payments/payments-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      User,
      ProcessedMessage,
    ]),
    UsersModule,
    RabbitmqModule,
    PaymentsClientModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersWorkerService],
})
export class OrdersModule {}
