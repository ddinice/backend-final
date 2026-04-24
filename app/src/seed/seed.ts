import { In } from 'typeorm';
import dataSource from '../../data-source';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';

type SeedOrderItem = {
  id: string;
  productTitle: string;
  quantity: number;
};

type SeedOrder = {
  id: string;
  userEmail: string;
  items: SeedOrderItem[];
};

const usersSeed = [
  { email: 'test@example.com', roles: ['user'] },
  { email: 'bob@example.com', roles: ['support'] },
  { email: 'admin@example.com', roles: ['admin'] }
];

const productsSeed = [
  { title: 'Coffee Mug', price: '12.90', isActive: true, stock: 100, version: 1 },
  { title: 'Notebook', price: '6.50', isActive: true, stock: 100, version: 1 },
  { title: 'Desk Lamp', price: '38.00', isActive: true, stock: 100, version: 1 },
  { title: 'Mechanical Keyboard', price: '129.00', isActive: true, stock: 10, version: 1 },
  { title: 'Wireless Mouse', price: '45.00', isActive: true, stock: 10, version: 1 }
];

const ordersSeed: SeedOrder[] = [
  {
    id: '216d5a55-946b-459d-859c-86fc4ca7eec2',
    userEmail: 'test@example.com',
    items: [
      {
        id: 'a5fd9721-33d9-49ec-a691-4570a1d134d5',
        productTitle: 'Coffee Mug',
        quantity: 2
      },
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        productTitle: 'Mechanical Keyboard',
        quantity: 1
      }
    ]
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled in production');
  }

  await dataSource.initialize();

  try {
    const usersRepository = dataSource.getRepository(User);
    const productsRepository = dataSource.getRepository(Product);
    const ordersRepository = dataSource.getRepository(Order);
    const orderItemsRepository = dataSource.getRepository(OrderItem);

    const passwordHash = await bcrypt.hash('password', 10);
    await usersRepository.upsert(usersSeed.map((user) => ({ ...user, passwordHash })), [
      'email'
    ]);
    await productsRepository.upsert(productsSeed, ['title']);

    const users = await usersRepository.find({
      where: { email: In(usersSeed.map((user) => user.email)) }
    });
    const usersByEmail = new Map(users.map((user) => [user.email, user]));

    const productTitles = productsSeed.map((product) => product.title);
    const products = await productsRepository.find({
      where: { title: In(productTitles) }
    });
    const productsByTitle = new Map(
      products.map((product) => [product.title, product])
    );

    const ordersToUpsert: Array<Partial<Order>> = [];
    const orderItemsToUpsert: Array<Partial<OrderItem>> = [];

    for (const orderSeed of ordersSeed) {
      const user = usersByEmail.get(orderSeed.userEmail);
      if (!user) {
        continue;
      }

      ordersToUpsert.push({
        id: orderSeed.id,
        userId: user.id,
        status: OrderStatus.PENDING
      });

      for (const item of orderSeed.items) {
        const product = productsByTitle.get(item.productTitle);
        if (!product) {
          throw new Error(`Missing product: ${item.productTitle}`);
        }

        orderItemsToUpsert.push({
          id: item.id,
          orderId: orderSeed.id,
          productId: product.id,
          quantity: item.quantity,
          priceAtPurchase: product.price
        });
      }
    }

    if (ordersToUpsert.length > 0) {
      await ordersRepository.upsert(ordersToUpsert, ['id']);
    }

    if (orderItemsToUpsert.length > 0) {
      await orderItemsRepository.upsert(orderItemsToUpsert, ['id']);
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
