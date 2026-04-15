import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
        NODE_ENV: Joi.string().valid('dev', 'prod').required(),
      }),
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'dev'}`,
    }),
    AuthModule,
    UsersModule
  ],
})
export class AppModule {}
