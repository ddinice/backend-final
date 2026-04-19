import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../entities/order.entity';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreatedOrderPayloadDto {
  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  userId: string;
  @ApiProperty({ type: [CreateOrderItemDto], description: 'Рядки замовлення після створення' })
  items: CreateOrderItemDto[];
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class CreateOrderResponseDto {
  @ApiProperty({ type: CreatedOrderPayloadDto })
  order: CreatedOrderPayloadDto;
}
