import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockVersionProduct1776921113058 implements MigrationInterface {
    name = 'StockVersionProduct1776921113058';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "products"
            ADD COLUMN IF NOT EXISTS "stock" integer NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
        `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "products"
                DROP COLUMN IF EXISTS "stock",
                DROP COLUMN IF EXISTS "version"; `,
        );
    }
}
