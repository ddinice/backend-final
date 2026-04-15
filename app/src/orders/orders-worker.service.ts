import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import type { ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { OrdersProcessMessage } from './orders-queue.types';
import { Order, OrderStatus } from './entities/order.entity';
import { ProcessedMessage } from './entities/processed-message.entity';
import {
  ORDERS_DLQ_ROUTING_KEY,
  ORDERS_EXCHANGE,
  ORDERS_PROCESS_QUEUE,
  ORDERS_RETRY_ROUTING_KEYS,
} from 'src/rabbitmq/rabbitmq.constants';

type ProcessingResult = 'success' | 'duplicate';

@Injectable()
export class OrdersWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OrdersWorkerService.name);
  private consumerTag: string | null = null;

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const ch = this.rabbitmqService.getChannel();
    const { consumerTag } = await ch.consume(
      ORDERS_PROCESS_QUEUE,
      (msg) => {
        void this.handleMessage(msg);
      },
      { noAck: false },
    );
    this.consumerTag = consumerTag;
    this.logger.log(`Worker is consuming ${ORDERS_PROCESS_QUEUE} (manual ack)`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.consumerTag) {
      return;
    }

    const ch = this.rabbitmqService.getChannel();
    await ch.cancel(this.consumerTag);
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    const ch = this.rabbitmqService.getChannel();
    const parsedMessage = this.parseMessage(msg);
    if (!parsedMessage) {
      this.logger.warn('Invalid payload, message acked without processing');
      ch.ack(msg);
      return;
    }

    try {
      const result = await this.processMessage(parsedMessage);
      ch.ack(msg);
      this.logger.log(
        `result=${result} messageId=${parsedMessage.messageId} orderId=${parsedMessage.orderId} attempt=${parsedMessage.attempt}`,
      );
    } catch (error) {
      try {
        await this.handleFailure(msg, parsedMessage, error);
      } catch (retryError) {
        const reason =
          retryError instanceof Error ? retryError.message : String(retryError);
        this.logger.error(
          `result=nack messageId=${parsedMessage.messageId} orderId=${parsedMessage.orderId} attempt=${parsedMessage.attempt} reason=${reason}`,
        );
        ch.nack(msg, false, true);
      }
    }
  }

  private async processMessage(
    message: OrdersProcessMessage,
  ): Promise<ProcessingResult> {
    return this.dataSource.transaction(async (manager) => {
      const processedMessagesRepository =
        manager.getRepository(ProcessedMessage);
      const ordersRepository = manager.getRepository(Order);

      try {
        await processedMessagesRepository.insert({
          messageId: message.messageId,
          orderId: message.orderId,
          handler: ORDERS_PROCESS_QUEUE,
        });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          return 'duplicate';
        }
        throw error;
      }

      const order = await ordersRepository.findOne({
        where: { id: message.orderId },
      });
      if (!order) {
        throw new Error('Order not found');
      }

      await this.simulateDelay();
      this.maybeForceFailure(message.attempt);

      order.status = OrderStatus.PROCESSED;
      order.processedAt = new Date();
      await ordersRepository.save(order);

      return 'success';
    });
  }

  private async handleFailure(
    originalMessage: ConsumeMessage,
    message: OrdersProcessMessage,
    error: unknown,
  ): Promise<void> {
    const ch = this.rabbitmqService.getChannel();
    const errorReason = error instanceof Error ? error.message : String(error);
    const nextAttempt = message.attempt + 1;
    const maxAttempts = this.getMaxAttempts();

    if (nextAttempt < maxAttempts) {
      const retryRoutingKey = this.getRetryRoutingKey(nextAttempt);
      const retryMessage: OrdersProcessMessage = {
        ...message,
        attempt: nextAttempt,
      };
      const published = this.rabbitmqService.publishToExchange(
        ORDERS_EXCHANGE,
        retryRoutingKey,
        retryMessage,
        {
          messageId: message.messageId,
          correlationId: message.correlationId,
          headers: {
            messageId: message.messageId,
            orderId: message.orderId,
            attempt: nextAttempt,
          },
        },
      );

      if (!published) {
        throw new Error('Retry publish failed');
      }

      ch.ack(originalMessage);
      this.logger.warn(
        `result=retry messageId=${message.messageId} orderId=${message.orderId} attempt=${message.attempt} nextAttempt=${nextAttempt} reason=${errorReason}`,
      );
      return;
    }

    const dlqPublished = this.rabbitmqService.publishToExchange(
      ORDERS_EXCHANGE,
      ORDERS_DLQ_ROUTING_KEY,
      {
        ...message,
        errorReason,
        failedAt: new Date().toISOString(),
      },
      {
        messageId: message.messageId,
        correlationId: message.correlationId,
        headers: {
          messageId: message.messageId,
          orderId: message.orderId,
          attempt: message.attempt,
        },
      },
    );

    if (!dlqPublished) {
      throw new Error('DLQ publish failed');
    }

    ch.ack(originalMessage);
    this.logger.error(
      `result=dlq messageId=${message.messageId} orderId=${message.orderId} attempt=${message.attempt} reason=${errorReason}`,
    );
  }

  private parseMessage(msg: ConsumeMessage): OrdersProcessMessage | null {
    try {
      const parsed = JSON.parse(
        msg.content.toString('utf-8'),
      ) as Partial<OrdersProcessMessage>;
      if (
        !parsed ||
        typeof parsed.messageId !== 'string' ||
        typeof parsed.orderId !== 'string' ||
        typeof parsed.attempt !== 'number' ||
        typeof parsed.createdAt !== 'string'
      ) {
        return null;
      }
      return {
        messageId: parsed.messageId,
        orderId: parsed.orderId,
        attempt: parsed.attempt,
        createdAt: parsed.createdAt,
        correlationId: parsed.correlationId,
        producer: parsed.producer,
        eventName: parsed.eventName,
      };
    } catch {
      return null;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return (error as { code?: string }).code === '23505';
  }

  private getMaxAttempts(): number {
    const value = Number(
      this.configService.get<string>('ORDERS_MAX_ATTEMPTS') ?? '3',
    );
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
  }

  private getRetryRoutingKey(nextAttempt: number): string {
    const index = Math.max(
      0,
      Math.min(nextAttempt - 1, ORDERS_RETRY_ROUTING_KEYS.length - 1),
    );
    return ORDERS_RETRY_ROUTING_KEYS[index];
  }

  private async simulateDelay(): Promise<void> {
    const delayMs = Number(
      this.configService.get<string>('ORDERS_WORKER_SIMULATED_DELAY_MS') ??
        '250',
    );
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private maybeForceFailure(attempt: number): void {
    const raw =
      this.configService.get<string>('ORDERS_WORKER_FAIL_ON_ATTEMPTS') ?? '';
    const failingAttempts = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);

    if (failingAttempts.includes(attempt)) {
      throw new Error(`Forced failure for attempt=${attempt}`);
    }
  }
}
