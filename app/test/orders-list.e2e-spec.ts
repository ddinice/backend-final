import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { JwtService } from '@nestjs/jwt';
import {
  ProcessedMessage,
  ProcessedMessageStatus,
} from '../src/idempotency/processed-message.entity';
import { Order } from '../src/orders/entities/order.entity';
import { OrderItem } from '../src/orders/entities/order-item.entity';
import * as bcrypt from 'bcryptjs';
import { ListOrdersQueryDto } from 'src/orders/dto/list-orders-query.dto';
import { ORDER_CREATE_SCOPE } from 'src/common/constants/order';
import { createHash, randomUUID } from 'crypto';

describe('Orders e2e: Orders List', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let user: User;
  let p1: Product;
  let order: Order;

  beforeAll(async () => {
    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    ds = modRef.get(DataSource);
    const users = ds.getRepository(User);
    const products = ds.getRepository(Product);
    const jwt = modRef.get(JwtService);

    user = await users.save(
      users.create({
        email: `orders-e2e-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash('password', 10),
        roles: ['user'],
      }),
    );

    token = jwt.sign({ sub: user.id, email: user.email, roles: ['user'] });
  });

  beforeEach(async () => {
    const products = ds.getRepository(Product);
    p1 = await products.save(
      products.create({
        title: `Regular Item ${randomUUID()}`,
        price: '12.90',
        stock: 50,
        isActive: true,
      }),
    );

    const orders = ds.getRepository(Order);
    order = await orders.save(
      orders.create({
        userId: user.id,
        items: [{ productId: p1.id, quantity: 1 }],
      }),
    );
    const processedMessages = ds.getRepository(ProcessedMessage);
    await processedMessages.save(
      processedMessages.create({
        scope: ORDER_CREATE_SCOPE,
        idempotencyKey: `k-${Date.now()}-same`,
        requestHash: createHash('sha256')
          .update(
            JSON.stringify({
              userId: user.id,
              items: [{ productId: p1.id, quantity: 1 }],
            }),
          )
          .digest('hex'),
        status: ProcessedMessageStatus.PENDING,
      }),
    );
  });

  afterEach(async () => {
    if (!ds?.isInitialized) return;
    await ds
      .createQueryBuilder()
      .delete()
      .from(OrderItem)
      .where('1=1')
      .execute();
    await ds.createQueryBuilder().delete().from(Order).where('1=1').execute();
    await ds
      .createQueryBuilder()
      .delete()
      .from(ProcessedMessage)
      .where('1=1')
      .execute();
    await ds.getRepository(Product).delete({ id: p1.id });
    await ds.getRepository(Order).delete({ id: order.id });
  });

  afterAll(async () => {
    if (ds?.isInitialized && user?.id) {
      await ds.getRepository(User).delete({ id: user.id });
    }
    if (app) {
      await app.close();
    }
  });

  const getOrders = async (query: ListOrdersQueryDto) => {
    return await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .query(query);
  };

  it('validate: createdFrom is higher than createdTo - code 400', async () => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const query: ListOrdersQueryDto = {
      createdFrom: new Date(Date.now() + ONE_DAY).toISOString(),
      createdTo: new Date(Date.now() - ONE_DAY).toISOString(),
    };

    const r = await getOrders(query);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Bad Request');
  });

  it('validate: createdTo is higher than createdFrom - code 200', async () => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const query: ListOrdersQueryDto = {
      createdFrom: new Date(Date.now() - ONE_DAY).toISOString(),
      createdTo: new Date(Date.now() + ONE_DAY).toISOString(),
    };

    const r = await getOrders(query);
    expect(r.status).toBe(200);
    expect(r.body.data[0].id).toBe(order.id);
  });
});
