ALTER TABLE "clinics" ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false;
-- Preserve access for clinics already provisioned before account controls existed.
UPDATE "clinics" SET "whatsapp_enabled" = true
WHERE "id" IN (SELECT "clinic_id" FROM "whatsapp_connections" WHERE "status" = 'CONNECTED');
