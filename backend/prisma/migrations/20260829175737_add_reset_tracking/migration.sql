-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3);
