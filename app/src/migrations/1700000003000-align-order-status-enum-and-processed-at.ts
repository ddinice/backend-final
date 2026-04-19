import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignOrderStatusEnumAndProcessedAt1700000003000
  implements MigrationInterface
{
  name = 'AlignOrderStatusEnumAndProcessedAt1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'orders_status_enum' AND e.enumlabel = 'PENDING'
        ) THEN
          ALTER TYPE "orders_status_enum" ADD VALUE 'PENDING';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'orders_status_enum' AND e.enumlabel = 'PROCESSED'
        ) THEN
          ALTER TYPE "orders_status_enum" ADD VALUE 'PROCESSED';
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMPTZ`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::orders_status_enum`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'CREATED'::orders_status_enum`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "processed_at"`,
    );
  }
}
