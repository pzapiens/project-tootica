BEGIN;

-- Preserve appointment history while retiring the removed status.
UPDATE "appointments" SET "status" = 'CANCELLED' WHERE "status" = 'NO_SHOW';

ALTER TYPE "AppointmentStatus" RENAME TO "AppointmentStatus_old";
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED');
ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "AppointmentStatus"
  USING ("status"::text::"AppointmentStatus");
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
DROP TYPE "AppointmentStatus_old";

COMMIT;
