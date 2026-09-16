-- A pending WhatsApp lead can carry age/gender before a patient row exists.
-- AlterTable: add the lead's gender + date-of-birth contact fields.
ALTER TABLE "appointments" ADD COLUMN     "contact_gender" TEXT,
ADD COLUMN     "contact_dob" DATE;
