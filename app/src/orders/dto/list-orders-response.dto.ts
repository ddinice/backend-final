import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../entities/order.entity';

export class ListOrdersItemDto {
  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440001' })
  userId: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: Number, example: 3 })
  itemsCount: number;

  @ApiProperty({ type: String, example: '129.90' })
  totalSum: string;
}

export class ListOrdersMetaDto {
  @ApiProperty({ type: Number, example: 1 })
  page: number;

  @ApiProperty({ type: Number, example: 10 })
  limit: number;

  @ApiProperty({ type: Number, example: 100 })
  total: number;

  @ApiProperty({ type: Number, example: 10 })
  totalPages: number;

  @ApiProperty({ type: Boolean, example: true })
  hasNext: boolean;

  @ApiProperty({ type: Boolean, example: false })
  hasPrev: boolean;
}

export class ListOrdersAggregatesDto {
  @ApiProperty({ type: Number, example: 8 })
  itemsCount: number;

  @ApiProperty({ type: String, example: '259.80' })
  totalSum: string;
}

export class ListOrdersResponseDto {
  @ApiProperty({ type: [ListOrdersItemDto] })
  data: ListOrdersItemDto[];

  @ApiProperty({ type: ListOrdersMetaDto })
  meta: ListOrdersMetaDto;

  @ApiProperty({ type: ListOrdersAggregatesDto })
  aggregates: ListOrdersAggregatesDto;
}