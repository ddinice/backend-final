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

    const maxAttempts = 30;
    const delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let conn: ChannelModel | null = null;
      let ch: Channel | null = null;
      try {
        conn = await amqp.connect(url);
        ch = await conn.createChannel();
        await ch.prefetch(prefetch);
        await this.assertInfrastructureOnChannel(ch);
        this.connection = conn;
        this.channel = ch;
        this.logger.log(
          `RabbitMQ connected (prefetch=${prefetch}, attempts=${attempt})`,
        );
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `RabbitMQ connect attempt ${attempt}/${maxAttempts} failed: ${message}`,
        );
        try {
          await ch?.close();
        } catch {
          /* ignore */
        }
        try {
          await conn?.close();
        } catch {
          /* ignore */
        }
        if (attempt === maxAttempts) {
          this.logger.error('RabbitMQ: max connect attempts reached');
          throw err;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  private getChannel(): Channel {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    return this.channel;
  }

  private async assertInfrastructureOnChannel(ch: Channel) {
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
