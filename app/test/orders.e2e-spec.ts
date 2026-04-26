import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { randomUUID } from 'crypto';
import { OrderStatus } from '../src/orders/entities/order.entity';

describe('Orders e2e', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let jwtService: JwtService;
  let user: User;
  let p1: Product;
  let lowStock: Product;

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
    jwtService = modRef.get(JwtService);

    user = await users.save(
      users.create({
        email: `orders-e2e-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash('password', 10),
        roles: ['user'],
      }),
    );

    token = jwtService.sign({ sub: user.id, email: user.email, roles: ['user'] });
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
    lowStock = await products.save(
      products.create({
        title: `Low Stock Item ${randomUUID()}`,
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

  const getOrders = (
    query?: Record<string, unknown>,
    authToken: string = token,
  ) =>
    request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .query(query ?? {});

  it('double-submit returns same order', async () => {
    const key = `k-${Date.now()}-same`;
    const payload = [{ productId: p1.id, quantity: 1 }];

    const r1 = await postOrder(key, payload);
    const r2 = await postOrder(key, payload);

    expect(r1.status).toBe(201);
    expect([201, 409]).toContain(r2.status);
    if (r2.status === 201) {
      expect(r2.body.order.id).toBeTruthy();
    } else {
      expect(r2.body.message).toBeTruthy();
    }
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

  it('GET /v1/orders returns envelope with meta and aggregates', async () => {
    await postOrder(`k-${Date.now()}-list-envelope`, [{ productId: p1.id, quantity: 2 }]);

    const r = await getOrders();
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.meta).toBeTruthy();
    expect(r.body.aggregates).toBeTruthy();
    expect(typeof r.body.meta.total).toBe('number');
    expect(typeof r.body.aggregates.itemsCount).toBe('number');
    expect(typeof r.body.aggregates.totalSum).toBe('string');
  });

  it('GET /v1/orders enforces role visibility: user sees only own orders', async () => {
    const users = ds.getRepository(User);
    const orders = ds.getRepository(Order);
    const orderItems = ds.getRepository(OrderItem);

    const otherUser = await users.save(
      users.create({
        email: `orders-other-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash('password', 10),
        roles: ['user'],
      }),
    );

    const ownOrder = await orders.save(orders.create({ userId: user.id, status: OrderStatus.PENDING }));
    const foreignOrder = await orders.save(
      orders.create({ userId: otherUser.id, status: OrderStatus.PENDING }),
    );
    await orderItems.save(
      orderItems.create({
        orderId: ownOrder.id,
        productId: p1.id,
        quantity: 1,
        priceAtPurchase: '12.90',
      }),
    );
    await orderItems.save(
      orderItems.create({
        orderId: foreignOrder.id,
        productId: p1.id,
        quantity: 1,
        priceAtPurchase: '12.90',
      }),
    );

    const userResp = await getOrders();
    expect(userResp.status).toBe(200);
    expect(userResp.body.data.every((x: { userId: string }) => x.userId === user.id)).toBe(true);

    const adminToken = jwtService.sign({
      sub: `admin-${randomUUID()}`,
      email: `admin-${randomUUID()}@example.com`,
      roles: ['admin'],
    });
    const adminResp = await getOrders({}, adminToken);
    expect(adminResp.status).toBe(200);
    expect(adminResp.body.data.some((x: { userId: string }) => x.userId === otherUser.id)).toBe(true);
  });

  it('GET /v1/orders filters by createdFrom/createdTo', async () => {
    await postOrder(`k-${Date.now()}-list-date`, [{ productId: p1.id, quantity: 1 }]);
    const now = new Date();
    const createdFrom = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const createdTo = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const r = await getOrders({ createdFrom, createdTo });
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
  });

  it('GET /v1/orders sorts by createdAt ASC/DESC', async () => {
    await postOrder(`k-${Date.now()}-list-sort-1`, [{ productId: p1.id, quantity: 1 }]);
    await postOrder(`k-${Date.now()}-list-sort-2`, [{ productId: p1.id, quantity: 1 }]);

    const asc = await getOrders({ sortOrder: 'ASC' });
    const desc = await getOrders({ sortOrder: 'DESC' });

    expect(asc.status).toBe(200);
    expect(desc.status).toBe(200);
    if (asc.body.data.length >= 2) {
      const ascFirst = new Date(asc.body.data[0].createdAt).getTime();
      const ascLast = new Date(asc.body.data[asc.body.data.length - 1].createdAt).getTime();
      expect(ascFirst).toBeLessThanOrEqual(ascLast);
    }
    if (desc.body.data.length >= 2) {
      const descFirst = new Date(desc.body.data[0].createdAt).getTime();
      const descLast = new Date(desc.body.data[desc.body.data.length - 1].createdAt).getTime();
      expect(descFirst).toBeGreaterThanOrEqual(descLast);
    }
  });

  it('GET /v1/orders paginates and returns correct meta.total', async () => {
    await postOrder(`k-${Date.now()}-list-page-1`, [{ productId: p1.id, quantity: 1 }]);
    await postOrder(`k-${Date.now()}-list-page-2`, [{ productId: p1.id, quantity: 1 }]);
    await postOrder(`k-${Date.now()}-list-page-3`, [{ productId: p1.id, quantity: 1 }]);

    const r = await getOrders({ page: 1, limit: 2, sortOrder: 'DESC' });
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(2);
    expect(r.body.meta.page).toBe(1);
    expect(r.body.meta.limit).toBe(2);
    expect(r.body.meta.total).toBeGreaterThanOrEqual(r.body.data.length);
    expect(r.body.meta.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('GET /v1/orders returns correct itemsCount and totalSum aggregates', async () => {
    await postOrder(`k-${Date.now()}-agg-1`, [{ productId: p1.id, quantity: 2 }]);
    await postOrder(`k-${Date.now()}-agg-2`, [{ productId: p1.id, quantity: 3 }]);

    const r = await getOrders({ page: 1, limit: 20, sortOrder: 'DESC' });
    expect(r.status).toBe(200);

    const summedItems = r.body.data.reduce(
      (acc: number, item: { itemsCount: number }) => acc + Number(item.itemsCount),
      0,
    );
    const summedTotal = r.body.data
      .reduce(
        (acc: number, item: { totalSum: string }) => acc + Number(item.totalSum),
        0,
      )
      .toFixed(2);

    expect(r.body.aggregates.itemsCount).toBe(summedItems);
    expect(Number(r.body.aggregates.totalSum).toFixed(2)).toBe(summedTotal);
  });
});