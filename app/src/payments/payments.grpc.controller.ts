import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { randomUUID } from 'crypto';

type CaptureRequest = {
  order_id?: string;
  orderId?: string;
  idempotency_key?: string;
  idempotencyKey?: string;
  amount?: string;
  currency?: string;
};

type CaptureReply = {
  status: string;
  payment_id: string;
};

@Controller()
export class PaymentsGrpcController {
  private readonly logger = new Logger(PaymentsGrpcController.name);
  private readonly captures = new Map<string, string>();

  @GrpcMethod('Payments', 'Capture')
  capture(req: CaptureRequest): CaptureReply {
    const orderId = req.order_id ?? req.orderId ?? '';
    const idempotencyKey = req.idempotency_key ?? req.idempotencyKey ?? orderId;
    const existing = this.captures.get(idempotencyKey);
    if (existing) {
      this.logger.log(`Capture replay idempotency_key=${idempotencyKey}`);
      return { status: 'SUCCEEDED', payment_id: existing };
    }
    const paymentId = randomUUID();
    this.captures.set(idempotencyKey, paymentId);
    this.logger.log(
      `Capture order_id=${orderId} amount=${req.amount} ${req.currency} payment_id=${paymentId}`,
    );
    return { status: 'SUCCEEDED', payment_id: paymentId };
  }
}
