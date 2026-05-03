import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import {
  Observable,
  catchError,
  firstValueFrom,
  throwError,
  timeout,
} from 'rxjs';

export type CaptureParams = {
  orderId: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
};

type CaptureReply = {
  status: string;
  payment_id: string;
};

interface PaymentsGrpc {
  capture(data: Record<string, string>): Observable<CaptureReply>;
}

@Injectable()
export class PaymentsGrpcClient implements OnModuleInit {
  private readonly logger = new Logger(PaymentsGrpcClient.name);
  private payments: PaymentsGrpc | undefined;

  constructor(
    @Inject('PAYMENTS_GRPC') private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.payments = this.client.getService<PaymentsGrpc>('Payments');
  }

  async capture(params: CaptureParams): Promise<CaptureReply> {
    if (this.configService.get<string>('PAYMENTS_GRPC_DISABLED') === 'true') {
      this.logger.log('PAYMENTS_GRPC_DISABLED: skipping remote Capture');
      return { status: 'SUCCEEDED', payment_id: 'local-mock' };
    }
    if (!this.payments) {
      throw new Error('Payments gRPC service not initialized');
    }
    const deadlineMs = Number(
      this.configService.get<string>('PAYMENTS_GRPC_DEADLINE_MS') ?? '5000',
    );
    const grpcReq = {
      order_id: params.orderId,
      idempotency_key: params.idempotencyKey,
      amount: params.amount,
      currency: params.currency,
    };
    const stream = this.payments.capture(grpcReq).pipe(
      timeout({ first: deadlineMs }),
      catchError((err) => {
        this.logger.warn(`Capture gRPC error: ${(err as Error).message}`);
        return throwError(() => err);
      }),
    );
    return firstValueFrom(stream);
  }
}
