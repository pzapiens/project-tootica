-- AlterTable: per-entry paid flag replaces the appointment-level settled flag.
ALTER TABLE "payments" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "payment_complete";
