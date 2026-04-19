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
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
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
} from '@nestjs/swagger';
import { AuditService } from 'src/common/audit/audit.service';

function clientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') {
    return xf.split(',')[0]?.trim();
  }
  if (Array.isArray(xf)) {
    return xf[0]?.split(',')[0]?.trim();
  }
  return req.socket?.remoteAddress;
}

@SkipThrottle({ strict: true })
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly auditService: AuditService,
  ) {}

  @Roles('admin', 'support', 'user')
  @Post()
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({
    description: 'Order has been created',
    type: CreateOrderResponseDto,
  })
  async create(
    @Req() req: Request & { user?: any },
    @Body() body: CreateOrderDto,
  ): Promise<CreateOrderResponseDto> {
    const userId = (req.user as AuthUser).sub;
    const { items } = body;
    return this.ordersService.createOrder(userId, items);
  }

  @Roles('user', 'admin', 'support')
  @Get()
  @ApiOkResponse({
    description: 'Orders have been found',
    type: [CreateOrderResponseDto],
  })
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
  @SkipThrottle({ strict: false })
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @Delete(':id')
  async remove(
    @Req() req: Request & { user?: AuthUser },
    @Param('id') id: string,
  ) {
    const deleted = await this.ordersService.deleteById(id);
    if (!deleted) {
      throw new NotFoundException('Order not found');
    }
    const user = req.user as AuthUser;
    this.auditService.emit({
      action: 'orders.delete',
      actorId: user.sub,
      actorRoles: user.roles,
      targetType: 'order',
      targetId: id,
      outcome: 'success',
      correlationId: req.correlationId ?? 'unknown',
      ip: clientIp(req),
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
    });
    return { ok: true };
  }
}
