import { Module } from '@nestjs/common';
import { PaymentsSwaggerController } from './payments.swagger.controller';

@Module({
  controllers: [PaymentsSwaggerController],
})
export class PaymentsDocsModule {}
