process.env.NODE_ENV = 'dev';
process.env.PORT = process.env.PORT || '3000';

// Avoid external brokers during e2e; process payment inline after create.
process.env.RABBITMQ_DISABLED = process.env.RABBITMQ_DISABLED ?? 'true';
process.env.ORDER_PROCESS_INLINE = process.env.ORDER_PROCESS_INLINE ?? 'true';
process.env.PAYMENTS_GRPC_DISABLED =
  process.env.PAYMENTS_GRPC_DISABLED ?? 'true';

// Joi + JWT require these if not already set from `.env.dev`
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'e2e-jwt-secret-min-32-chars-long!!';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME || 'postgres';

// Satisfy Joi when RabbitMQ is not disabled in some CI variants
process.env.RABBITMQ_URL =
  process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
