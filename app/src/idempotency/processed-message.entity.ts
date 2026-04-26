import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProcessedMessageStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('processed_messages')
@Index(
  'UQ_processed_messages_scope_idempotency_key',
  ['scope', 'idempotencyKey'],
  {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  },
)
export class ProcessedMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'scope' })
  scope: string;

  @Column({
    type: 'varchar',
    length: 200,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', enum: ProcessedMessageStatus })
  status: ProcessedMessageStatus;

  @Column({ type: 'varchar', name: 'request_hash' })
  requestHash: string;

  @Column({ type: 'uuid', name: 'resource_id', nullable: true })
  resourceId: string | null;

  @Column({ type: 'integer', name: 'response_code', nullable: true })
  responseCode: number;

  @Column({ type: 'varchar', name: 'response_message', nullable: true })
  responseMessage: string;

  @Column({ type: 'integer', name: 'error_code', nullable: true })
  errorCode: number;

  @Column({ type: 'varchar', name: 'error_message', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Column({
    type: 'timestamptz',
    name: 'expires_at',
    default: () => `now() + INTERVAL '24 hour'`,
  })
  expiresAt: Date;
}
