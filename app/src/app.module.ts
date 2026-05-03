import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import * as Joi from 'joi';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './orders/orders.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PaymentsDocsModule } from './payments/payments-docs.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
        NODE_ENV: Joi.string().valid('dev', 'prod').required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().optional(),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().allow('').required(),
        DB_NAME: Joi.string().required(),
        RABBITMQ_URL: Joi.string().when('RABBITMQ_DISABLED', {
          is: Joi.valid('true'),
          then: Joi.optional(),
          otherwise: Joi.required(),
        }),
        RABBITMQ_DISABLED: Joi.string().valid('true', 'false').optional(),
        RABBITMQ_PREFETCH: Joi.number().optional(),
        PAYMENTS_GRPC_URL: Joi.string().optional(),
        PAYMENTS_GRPC_DISABLED: Joi.string().valid('true', 'false').optional(),
        PAYMENTS_GRPC_DEADLINE_MS: Joi.number().optional(),
        PAYMENTS_DEFAULT_CURRENCY: Joi.string().optional(),
        ORDER_PROCESS_INLINE: Joi.string().valid('true', 'false').optional(),
      }),
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'dev'}`,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 500 }],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    OrdersModule,
    RabbitmqModule,
    HealthModule,
    MetricsModule,
    PaymentsDocsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
