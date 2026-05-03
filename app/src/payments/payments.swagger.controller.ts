import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsGrpcContractDto } from './dto/grpc-payments-contract.dto';

/**
 * Swagger documentation for the gRPC Payments service (this HTTP app is only a client).
 */
@ApiTags('Payments (gRPC)')
@SkipThrottle()
@Controller('payments')
export class PaymentsSwaggerController {
  @Get('grpc-contract')
  @ApiOperation({
    summary: 'gRPC Payments.Capture contract',
    description:
      'This route is for OpenAPI only: real payment capture happens via gRPC `Payments.Capture` in the payments microservice (see `payments.grpc.bootstrap`). The orders HTTP API uses `PaymentsGrpcClient`.',
  })
  @ApiOkResponse({ type: PaymentsGrpcContractDto })
  grpcContract(): PaymentsGrpcContractDto {
    return {
      transport: 'gRPC',
      package: 'payments',
      service: 'Payments',
      rpc: 'Capture',
      request: {
        order_id: '550e8400-e29b-41d4-a716-446655440000',
        idempotency_key: 'capture:msg-uuid',
        amount: '99.50',
        currency: 'UAH',
      },
      reply: {
        status: 'SUCCEEDED',
        payment_id: '7b2c8f1a-0d4e-4c1b-9f3a-112233445566',
      },
      protoPath: 'src/proto/payments.proto',
    };
  }
}
