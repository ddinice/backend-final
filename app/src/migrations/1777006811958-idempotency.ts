import { MigrationInterface, QueryRunner } from "typeorm";

export class Idempotency1777006811958 implements MigrationInterface {
    name = 'Idempotency1777006811958'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "processed_messages" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "scope" varchar(100) NOT NULL,
                "idempotency_key" varchar(200),
                "status" varchar(50) NOT NULL,
                "request_hash" varchar(255) NOT NULL,
                "resource_id" uuid NOT NULL,
                "response_code" integer,
                "response_message" varchar(255),
                "error_code" integer,
                "error_message" varchar(255),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            )
        `,
        );

        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_processed_messages_scope_idempotency_key"
            ON "processed_messages" ("scope", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL;`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX IF EXISTS "UQ_processed_messages_scope_idempotency_key"`,
        );
        await queryRunner.query(
            `DROP TABLE IF EXISTS "processed_messages"`,
        );
    }
}
