import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
// import { Roles } from '../auth/roles.decorator';
// import { RolesGuard } from '../auth/roles.guard';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { AuthUser } from 'src/auth/types.ts';
// import type { AuthUser } from '../auth/types';

type CreateOrderBody = {
  items: Array<{ productId: string; quantity: number }>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles('admin', 'support', 'user')
  @Post()
  async create(
    @Req() req: Request & { user?: any },
    @Body() body: CreateOrderBody,
  ) {
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    for (const it of items) {
      if (!it?.productId || typeof it.productId !== 'string') {
        throw new BadRequestException('items[].productId is required');
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new BadRequestException(
          'items[].quantity must be a positive integer',
        );
      }
    }

    const userId = (req.user as AuthUser).sub;
    return this.ordersService.createOrder(userId, items);
  }

  @Roles('user', 'admin', 'support')
  @Get()
  @UseGuards(JwtAuthGuard)
  async list() {
    return this.ordersService.findAll();
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
