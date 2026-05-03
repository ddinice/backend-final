import { ApiProperty } from '@nestjs/swagger';

export class GrpcCaptureRequestDocDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  order_id: string;

  @ApiProperty({ example: 'capture:msg-uuid' })
  idempotency_key: string;

  @ApiProperty({ example: '99.50' })
  amount: string;

  @ApiProperty({ example: 'UAH' })
  currency: string;
}

export class GrpcCaptureReplyDocDto {
  @ApiProperty({
    example: 'SUCCEEDED',
    description: 'e.g. SUCCEEDED on successful capture',
  })
  status: string;

  @ApiProperty({
    example: '7b2c8f1a-...',
    description: 'Payment identifier',
  })
  payment_id: string;
}

export class PaymentsGrpcContractDto {
  @ApiProperty({
    description:
      'Actual calls use gRPC (separate container / `npm run start:payments-grpc`), not this HTTP API.',
  })
  transport: string;

  @ApiProperty({ example: 'payments' })
  package: string;

  @ApiProperty({ example: 'Payments' })
  service: string;

  @ApiProperty({ example: 'Capture' })
  rpc: string;

  @ApiProperty({ type: GrpcCaptureRequestDocDto })
  request: GrpcCaptureRequestDocDto;

  @ApiProperty({ type: GrpcCaptureReplyDocDto })
  reply: GrpcCaptureReplyDocDto;

  @ApiProperty({
    example: 'src/proto/payments.proto',
    description: 'Contract source file in the repository',
  })
  protoPath: string;
}
