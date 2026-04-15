import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('processed_messages')
@Index('IDX_processed_messages_order_id', ['orderId'])
@Index('IDX_processed_messages_message_id_unique', ['messageId'], {
  unique: true,
})
export class ProcessedMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'message_id' })
  messageId: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  handler: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'processed_at' })
  processedAt: Date;
}
