import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPasswordHash1700000002000 implements MigrationInterface {
  name = 'AddUserPasswordHash1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar(255)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "password_hash"');
  }
}

