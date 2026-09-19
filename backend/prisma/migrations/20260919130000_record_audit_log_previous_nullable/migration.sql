-- AlterTable: `previous` is null for a create (no prior data).
ALTER TABLE "record_audit_logs" ALTER COLUMN "previous" DROP NOT NULL;
