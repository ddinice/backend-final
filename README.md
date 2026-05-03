# backend-final

NestJS API: замовлення з оптимістичною конкуренцією по `version`, фонова обробка через RabbitMQ, оплата через окремий gRPC-сервіс **Payments**, health і Prometheus-метрики.

## Навіщо optimistic locking

Під навантаженням немає довгих блокувань рядків: оновлення запасу й `version` атомарні; при конфлікті клієнт отримує помилку і може повторити запит. PostgreSQL добре оптимізує такий `UPDATE … WHERE version = $n`.

## RabbitMQ і gRPC у проєкті

### Що робить RabbitMQ

**RabbitMQ** тут — це **брокер повідомлень** між HTTP API і фоновою обробкою замовлення.

- Після успішного **`POST /v1/orders`** сервіс **публікує повідомлення** в чергу **`orders.process`** (JSON: `orderId`, `messageId`, позиції тощо).
- **Воркер** у процесі `api` **підписується на чергу** й асинхронно викликає `processOrder` (оплата та перехід у `PAID`).
- **Навіщо:** HTTP-відповідь не чекає на оплату; знімається пікове навантаження з запиту створення; можливі повторні доставки з урахуванням ідемпотентності.
- Management UI RabbitMQ: порт **15672** (у `docker-compose`).
- Черга **`orders.dlq`** для повідомлень, що не вдалося обробити (за логікою воркера).

Якщо **`RABBITMQ_DISABLED=true`** або **`ORDER_PROCESS_INLINE=true`**, шлях через Rabbit **не використовується** (зручно для тестів і простого локального запуску).

### Навіщо gRPC (Payments)

**gRPC** — **внутрішній виклик оплати** між Nest API (клієнт) і процесом **`payments`** за контрактом **`app/src/proto/payments.proto`** (RPC **`Payments.Capture`**).

- **Для чого:** окремий мікросервіс з чіткою схемою повідомлень; зручний **service-to-service** виклик.
- **`PAYMENTS_GRPC_URL`** у Docker зазвичай `payments:50051`.
- У Swagger опис контракту: **`GET /v1/payments/grpc-contract`**; реальна оплата йде по gRPC, не REST.

## Настрій середовища

Скопіюйте `app/.env.example` у `app/.env.dev` (локально файл ігнорується git) або задайте змінні в оточенні. Joi в `AppModule` перевіряє обов’язкові поля при старті.

| Змінна | Призначення |
|--------|-------------|
| `RABBITMQ_DISABLED=true` | Не підключатися до брокера (e2e, простий локальний запуск). |
| `ORDER_PROCESS_INLINE=true` | Обробка замовлення в тому ж процесі після create (без черги). |
| `PAYMENTS_GRPC_DISABLED=true` | Mock capture без реального gRPC. |

Повний контур у Docker: усі три прапорці вимкнені / `false`, задані `RABBITMQ_URL` і `PAYMENTS_GRPC_URL`.

## Настрізний сценарій (API)

1. **Реєстрація / логін** — JWT (`Bearer`).
2. **`POST /v1/orders`** — позиції `productId`, `quantity`; відповідь зі статусом на кшталт `PENDING`.
3. З **чергою** (без inline): воркер → сума → **Payments.Capture** (gRPC) → **`PAID`**, `processedAt`.
4. З **inline** — те саме без RabbitMQ.
5. **`GET /v1/orders/:id`** — власник або `admin` / `support`.

Додатково: пагінований список замовлень, ідемпотентність створення (див. `OrdersService`).

## Локальний запуск

Потрібні Node 22+, PostgreSQL.

```bash
cd app
npm ci
cp .env.example .env.dev   # відредагуйте значення
npm run db:migrate
npm run start:dev
```

gRPC-сервіс оплат (якщо не `PAYMENTS_GRPC_DISABLED`):

```bash
npm run build
npm run start:payments-grpc
```

## Docker Compose

З кореня репозиторію:

```bash
docker compose up --build
```

**Nginx** (профіль `edge`) — порт **80** → `api:3000`; конфіг: `deploy/nginx/nginx.conf`.

```bash
docker compose --profile edge up -d --build
```

Сервіси: `postgres`, `rabbitmq`, `payments`, `api`. Перед першим запуском API застосуйте міграції (з хоста, якщо проброшено `5432`):

```bash
cd app && npm run db:migrate
```

(у `.env.dev` вкажіть `DB_HOST=localhost`, якщо Postgres у контейнері.)

Задайте надійний **`JWT_SECRET`** для `api` (у `docker-compose` можна через змінні оточення хоста). Пароль БД у `docker-compose` за замовчуванням `postgres` — для продакшену змініть узгоджено для `postgres` і `api` (`DB_PASSWORD`).

## Спостереження

- `GET /v1/health` — liveness/readiness.
- `GET /v1/metrics` — Prometheus (`prom-client`).

Swagger: `GET /v1/api` (глобальний префікс `v1`).

## Тести та CI

- `npm run test` — unit: `src/orders/orders.service.spec.ts` (доступ до замовлення, `processOrder` без HTTP).
- `npm run test:e2e` — PostgreSQL + міграції; `test/setup-e2e.ts` вмикає зручні для CI режими.

GitHub Actions: `.github/workflows/ci.yml` — збірка, міграції, e2e.

## Безпека

Helmet, глобальний `ThrottlerGuard`, JWT на захищених маршрутах, RBAC на `GET /v1/orders/:id`.
