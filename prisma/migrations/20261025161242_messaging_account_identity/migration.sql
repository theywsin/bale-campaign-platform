-- AlterTable
ALTER TABLE "messaging_accounts" ADD COLUMN     "external_name" VARCHAR(100),
ADD COLUMN     "last_checked_at" TIMESTAMPTZ(3);
