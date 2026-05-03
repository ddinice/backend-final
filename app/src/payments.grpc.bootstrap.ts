import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { PaymentsGrpcModule } from './payments/payments.grpc.module';

async function bootstrap() {
  const port = Number(process.env.PAYMENTS_GRPC_PORT ?? 50051);
  const protoPath = join(__dirname, '..', 'proto', 'payments.proto');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentsGrpcModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'payments',
        protoPath,
        url: `0.0.0.0:${port}`,
      },
    },
  );

  await app.listen();
  Logger.log(`Payments gRPC listening on 0.0.0.0:${port}`, 'PaymentsGrpc');
}

bootstrap();
