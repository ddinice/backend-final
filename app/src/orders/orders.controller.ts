import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  Headers,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import type { AuthUser } from '../auth/types';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiTags,
  ApiOkResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { ListOrdersResponseDto } from './dto/list-orders-response.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles('user', 'admin', 'support')
  @Post()
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({
    description: 'Order has been created',
    type: CreateOrderResponseDto,
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description: 'Idempotency key',
    example: '1234567890',
  })
  async create(
    @Req() req: Request & { user?: any },
    @Body() body: CreateOrderDto,
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ): Promise<CreateOrderResponseDto> {

    const userId = (req.user as AuthUser).sub;
    const { items } = body;

    return this.ordersService.createOrder(
      userId,
      items,
      idempotencyKey,
    );
  }

  @Roles('user', 'admin', 'support')
  @Get()
  @ApiOkResponse({
    description: 'Orders have been found',
    type: ListOrdersResponseDto,
  })
  async list(
    @Req() req: Request & { user?: AuthUser },
    @Query() query: ListOrdersQueryDto,
  ): Promise<ListOrdersResponseDto> {
    return this.ordersService.findAll(req.user as AuthUser, query);
  }

  @Roles('user', 'admin', 'support')
  @Get(':id')
  async byId(@Param('id') id: string) {
    const order = await this.ordersService.findById(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const deleted = await this.ordersService.deleteById(id);
    if (!deleted) {
      throw new NotFoundException('Order not found');
    }
    return { ok: true };
  }
}
