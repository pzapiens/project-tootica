-- A pending WhatsApp booking from a new lead has no patient until it's accepted.
-- DropForeignKey (recreated below as nullable-friendly; constraint name unchanged)
-- AlterTable: patient becomes optional, add the pending lead's contact fields.
ALTER TABLE "appointments" ALTER COLUMN "patient_id" DROP NOT NULL;

ALTER TABLE "appointments" ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "contact_email" TEXT;
