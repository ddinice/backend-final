import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { OrdersProcessMessage } from './orders-queue.types';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { Channel, ConsumeMessage } from 'amqplib';

@Injectable()
export class OrdersWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersWorkerService.name);
  private readonly maxAttempts = 3;

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly ordersService: OrdersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.rabbitmqService.isDisabled()) {
      this.logger.warn(
        'Orders worker: RabbitMQ disabled, consumer not started',
      );
      return;
    }
    this.logger.log('Starting Orders Worker');
    await this.rabbitmqService.consume('orders.process', async (msg, ch) => {
      await this.handleMessage(msg, ch);
    });

    this.logger.log('Orders worker subscribed: orders.process');
  }

  private async handleMessage(
    message: ConsumeMessage,
    ch: Channel,
  ): Promise<void> {
    let payload: OrdersProcessMessage;
    try {
      payload = JSON.parse(
        message.content.toString('utf-8'),
      ) as OrdersProcessMessage;
    } catch (err) {
      this.logger.warn('Invalid JSON payload, sending to DLQ');
      this.rabbitmqService.publishToQueue('orders.dlq', {
        raw: message.content.toString('base64'),
      });
      ch.ack(message);
      return;
    }

    const attempt = Number(payload.attempt ?? 1);
    const messageId = payload.messageId ?? '(missing)';

    try {
      await this.ordersService.processOrder({ ...payload, attempt });
      ch.ack(message);
      return;
    } catch (err) {
      this.logger.warn(
        `Orders worker failed (messageId=${messageId}, orderId=${payload.orderId}, attempt=${attempt})`,
      );
    }

    if (attempt >= this.maxAttempts) {
      this.rabbitmqService.publishToQueue('orders.dlq', {
        ...payload,
        attempt,
      });
      ch.ack(message);
      return;
    }

    this.rabbitmqService.publishToQueue('orders.process', {
      ...payload,
      attempt: attempt + 1,
    });
    ch.ack(message);
  }
}
