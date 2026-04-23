import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderStatusProductActive1700000001000
  implements MigrationInterface
{
  name = 'AddOrderStatusProductActive1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "orders_status_enum" AS ENUM (
          'CREATED',
          'PENDING',
          'PROCESSED',
          'PAID',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "status" "orders_status_enum" NOT NULL DEFAULT 'CREATED'`,
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_orders_created_at" ON "orders" ("created_at")',
    );

    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_products_title_unique" ON "products" ("title")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_products_title_unique"');
    await queryRunner.query('ALTER TABLE "products" DROP COLUMN "is_active"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_orders_created_at"');
    await queryRunner.query('ALTER TABLE "orders" DROP COLUMN "status"');
    await queryRunner.query('DROP TYPE IF EXISTS "orders_status_enum"');
  }
}
