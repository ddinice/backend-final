import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PaymentsGrpcClient } from './payments-grpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PAYMENTS_GRPC',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'payments',
            protoPath: join(__dirname, '..', '..', 'proto', 'payments.proto'),
            url: config.get<string>('PAYMENTS_GRPC_URL', '127.0.0.1:50051'),
          },
        }),
      },
    ]),
  ],
  providers: [PaymentsGrpcClient],
  exports: [PaymentsGrpcClient],
})
export class PaymentsClientModule {}
