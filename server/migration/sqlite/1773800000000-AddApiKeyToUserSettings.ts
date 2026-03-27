import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyToUserSettings1773800000000 implements MigrationInterface {
  name = 'AddApiKeyToUserSettings1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "apiKey" varchar UNIQUE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "apiKey"`);
  }
}
