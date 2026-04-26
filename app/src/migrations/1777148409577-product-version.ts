import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVersion1777148409577 implements MigrationInterface {
    name = 'ProductVersion1777148409577'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
