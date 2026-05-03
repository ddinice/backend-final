import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { UsersService } from '../users/users.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { PaymentsGrpcClient } from '../payments/payments-grpc.client';
import type { AuthUser } from '../auth/types';
import type { OrdersProcessMessage } from './orders-queue.types';

describe('OrdersService (business rules)', () => {
  let service: OrdersService;
  let ordersRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let paymentsClient: { capture: jest.Mock };

  const userActor = (sub: string, roles: string[]): AuthUser => ({
    sub,
    roles,
    email: `${sub}@test`,
  });

  const baseMessage = (): OrdersProcessMessage => ({
    messageId: 'msg-1',
    orderId: 'order-1',
    attempt: 1,
    items: [{ productId: 'p1', quantity: 1 }],
  });

  beforeEach(async () => {
    ordersRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    paymentsClient = { capture: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: UsersService, useValue: {} },
        { provide: DataSource, useValue: {} },
        {
          provide: RabbitmqService,
          useValue: { publishToQueue: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'PAYMENTS_DEFAULT_CURRENCY') return 'UAH';
              return def;
            }),
          },
        },
        { provide: PaymentsGrpcClient, useValue: paymentsClient },
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('findOneForActor', () => {
    it('returns null when order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);
      const out = await service.findOneForActor(userActor('u1', ['user']), 'missing');
      expect(out).toBeNull();
    });

    it('returns order for owner', async () => {
      const order = {
        id: 'o1',
        userId: 'owner-1',
        status: OrderStatus.PENDING,
      } as Order;
      ordersRepo.findOne.mockResolvedValue(order);
      const out = await service.findOneForActor(userActor('owner-1', ['user']), 'o1');
      expect(out).toBe(order);
    });

    it('returns any order for admin', async () => {
      const order = {
        id: 'o1',
        userId: 'other',
        status: OrderStatus.PENDING,
      } as Order;
      ordersRepo.findOne.mockResolvedValue(order);
      const out = await service.findOneForActor(userActor('admin-1', ['admin']), 'o1');
      expect(out).toBe(order);
    });

    it('returns any order for support', async () => {
      const order = {
        id: 'o1',
        userId: 'other',
        status: OrderStatus.PENDING,
      } as Order;
      ordersRepo.findOne.mockResolvedValue(order);
      const out = await service.findOneForActor(userActor('s1', ['support']), 'o1');
      expect(out).toBe(order);
    });

    it('throws ForbiddenException when user is not owner and not privileged', async () => {
      const order = {
        id: 'o1',
        userId: 'owner-1',
        status: OrderStatus.PENDING,
      } as Order;
      ordersRepo.findOne.mockResolvedValue(order);
      await expect(
        service.findOneForActor(userActor('stranger', ['user']), 'o1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('processOrder', () => {
    it('returns without payment when order is missing', async () => {
      ordersRepo.findOne.mockResolvedValue(null);
      await service.processOrder(baseMessage());
      expect(paymentsClient.capture).not.toHaveBeenCalled();
    });

    it('returns without payment when order is already PAID (idempotent)', async () => {
      ordersRepo.findOne.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PAID,
        items: [{ priceAtPurchase: '10', quantity: 1 }],
      });
      await service.processOrder(baseMessage());
      expect(paymentsClient.capture).not.toHaveBeenCalled();
      expect(ordersRepo.update).not.toHaveBeenCalled();
    });

    it('skips capture when status is not PENDING', async () => {
      ordersRepo.findOne.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [],
      });
      await service.processOrder(baseMessage());
      expect(paymentsClient.capture).not.toHaveBeenCalled();
    });

    it('captures payment and marks PAID when order is PENDING', async () => {
      ordersRepo.findOne.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [
          { priceAtPurchase: '5.50', quantity: 2 },
          { priceAtPurchase: '1', quantity: 1 },
        ],
      });
      paymentsClient.capture.mockResolvedValue({ status: 'SUCCEEDED' });
      ordersRepo.update.mockResolvedValue({ affected: 1 });

      await service.processOrder(baseMessage());

      expect(paymentsClient.capture).toHaveBeenCalledWith({
        orderId: 'order-1',
        idempotencyKey: 'capture:msg-1',
        amount: '12.00',
        currency: 'UAH',
      });
      expect(ordersRepo.update).toHaveBeenCalledWith(
        { id: 'order-1', status: OrderStatus.PENDING },
        expect.objectContaining({
          status: OrderStatus.PAID,
          processedAt: expect.any(Date),
        }),
      );
    });
  });
});
