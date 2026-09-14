-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('WEB', 'WHATSAPP');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "booking_channel" "BookingChannel" NOT NULL DEFAULT 'WEB';

-- Backfill: existing appointments that came in via WhatsApp (previously only
-- distinguishable by their lead source) get the durable WHATSAPP channel.
UPDATE "appointments" SET "booking_channel" = 'WHATSAPP' WHERE "source_of_enquiry" = 'WHATSAPP';
