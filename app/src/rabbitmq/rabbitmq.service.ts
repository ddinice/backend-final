import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel, ChannelModel, ConsumeMessage, Options } from 'amqplib';
import * as amqp from 'amqplib';

export type RabbitConsumeHandler = (
  msg: ConsumeMessage,
  channel: Channel,
) => Promise<void>;

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly configService: ConfigService) {}

  isDisabled(): boolean {
    return this.configService.get<string>('RABBITMQ_DISABLED') === 'true';
  }

  async onModuleInit() {
    if (this.isDisabled()) {
      this.logger.warn(
        'RabbitMQ disabled (RABBITMQ_DISABLED=true): publish/consume no-op',
      );
      return;
    }
    this.logger.log('Init RabbitMQ service');
    const url = this.configService.getOrThrow<string>('RABBITMQ_URL');
    const prefetch = Number(
      this.configService.get<string>('RABBITMQ_PREFETCH') ?? '10',
    );

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    await this.channel.prefetch(prefetch);

    await this.assertInfrastructure();
    this.logger.log(`RabbitMQ connected (prefetch=${prefetch})`);
  }

  private getChannel(): Channel {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    return this.channel;
  }

  private async assertInfrastructure() {
    const ch = this.getChannel();

    await ch.assertQueue('orders.process', { durable: true });
    await ch.assertQueue('orders.dlq', { durable: true });
  }

  publishToQueue(
    queue: string,
    payload: unknown,
    options?: Options.Publish,
  ): boolean {
    if (this.isDisabled()) {
      this.logger.debug(`RabbitMQ disabled: skip publish queue=${queue}`);
      return true;
    }
    const ch = this.getChannel();
    const body = Buffer.from(JSON.stringify(payload));

    return ch.sendToQueue(queue, body, {
      contentType: 'application/json',
      persistent: true,
      ...options,
    });
  }

  async consume(
    queue: string,
    handler: RabbitConsumeHandler,
    options?: Options.Consume,
  ): Promise<void> {
    if (this.isDisabled()) {
      this.logger.warn(`RabbitMQ disabled: skip consume queue=${queue}`);
      return;
    }
    const ch = this.getChannel();

    await ch.consume(
      queue,
      async (msg) => {
        if (!msg) {
          return;
        }
        try {
          await handler(msg, ch);
        } catch (err) {
          this.logger.error(
            `Unhandled consumer error (queue=${queue})`,
            (err as Error)?.stack ?? String(err),
          );
          try {
            ch.nack(msg, false, true);
          } catch {
            /* ignore */
          }
        }
      },
      {
        noAck: false,
        ...options,
      },
    );
  }

  async onModuleDestroy() {
    if (this.isDisabled() || !this.channel) {
      return;
    }
    this.logger.log('Destroying RabbitMQ service');
    try {
      await this.channel.close();
    } catch {
      /* ignore */
    }
    try {
      await this.connection?.close();
    } catch {
      /* ignore */
    }
  }
}
