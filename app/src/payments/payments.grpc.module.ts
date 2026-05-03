import { Module } from '@nestjs/common';
import { PaymentsGrpcController } from './payments.grpc.controller';

@Module({
  controllers: [PaymentsGrpcController],
})
export class PaymentsGrpcModule {}
