import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { JwtService } from '@nestjs/jwt';
import { ProcessedMessage } from '../src/idempotency/processed-message.entity';
import { Order } from '../src/orders/entities/order.entity';
import { OrderItem } from '../src/orders/entities/order-item.entity';
import * as bcrypt from 'bcryptjs';

describe('Orders e2e', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let user: User;
  let p1: Product;
  let lowStock: Product;

  beforeAll(async () => {
    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    ds = modRef.get(DataSource);
    const users = ds.getRepository(User);
    const products = ds.getRepository(Product);
    const jwt = modRef.get(JwtService);

    user = await users.save(
      users.create({
        email: `orders-e2e-${Date.now()}@example.com`,
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
        title: `Regular Item ${Date.now()}`,
        price: '12.90',
        stock: 50,
        isActive: true,
      }),
    );
    lowStock = await products.save(
      products.create({
        title: `Low Stock Item ${Date.now()}`,
        price: '10.00',
        stock: 1,
        isActive: true,
      }),
    );
  });

  afterEach(async () => {
    if (!ds?.isInitialized) return;
    await ds.createQueryBuilder().delete().from(OrderItem).where('1=1').execute();
    await ds.createQueryBuilder().delete().from(Order).where('1=1').execute();
    await ds
      .createQueryBuilder()
      .delete()
      .from(ProcessedMessage)
      .where('1=1')
      .execute();
    await ds.getRepository(Product).delete({ id: p1.id });
    await ds.getRepository(Product).delete({ id: lowStock.id });
  });

  afterAll(async () => {
    if (ds?.isInitialized && user?.id) {
      await ds.getRepository(User).delete({ id: user.id });
    }
    if (app) {
      await app.close();
    }
  });

  const postOrder = (key: string, items: Array<{ productId: string; quantity: number }>) =>
    request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', key)
      .send({ items });

  it('double-submit returns same order', async () => {
    const key = `k-${Date.now()}-same`;
    const payload = [{ productId: p1.id, quantity: 1 }];

    const r1 = await postOrder(key, payload);
    const r2 = await postOrder(key, payload);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.order.id).toBe(r2.body.order.id);
  });

  it('same key + different payload => 409', async () => {
    const key = `k-${Date.now()}-conflict`;

    const r1 = await postOrder(key, [{ productId: p1.id, quantity: 1 }]);
    expect(r1.status).toBe(201);

    const r2 = await postOrder(key, [{ productId: p1.id, quantity: 2 }]);
    expect(r2.status).toBe(409);
    expect(r2.body.message).toBeTruthy();
  });

  it('out-of-stock => business error', async () => {
    const key = `k-${Date.now()}-oos`;

    const r = await postOrder(key, [{ productId: lowStock.id, quantity: 999 }]);
    expect([400, 409]).toContain(r.status);
    expect(r.body.message).toBeTruthy();
  });

  it('concurrent update on low stock', async () => {
    const r = await Promise.allSettled([
      postOrder(`k-${Date.now()}-c1`, [{ productId: lowStock.id, quantity: 1 }]),
      postOrder(`k-${Date.now()}-c2`, [{ productId: lowStock.id, quantity: 1 }]),
    ]);

    const responses = r
      .filter((x): x is PromiseFulfilledResult<request.Response> => x.status === 'fulfilled')
      .map((x) => x.value);

    const statuses = responses.map((x) => x.status).sort();
    expect(statuses).toContain(201);
    expect(statuses.some((s) => s === 409 || s === 400)).toBe(true);
  });
});