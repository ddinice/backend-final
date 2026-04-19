import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoles1700000002001 implements MigrationInterface {
  name = 'AddUserRoles1700000002001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN "roles" text[] NOT NULL DEFAULT ARRAY[]::text[]'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "roles"');
  }
}

