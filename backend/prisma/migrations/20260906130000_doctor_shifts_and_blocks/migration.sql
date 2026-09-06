-- Reshape doctor_shifts from weekly (day_of_week) to date + recurrence.
-- DropIndex
DROP INDEX "doctor_shifts_doctor_id_day_of_week_idx";

-- AlterTable
ALTER TABLE "doctor_shifts"
  DROP COLUMN "day_of_week",
  ADD COLUMN "group_id" TEXT,
  ADD COLUMN "frequency" TEXT NOT NULL,
  ADD COLUMN "date" DATE NOT NULL,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "doctor_shifts_doctor_id_idx" ON "doctor_shifts"("doctor_id");

-- CreateTable
CREATE TABLE "doctor_blocks" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_blocks_clinic_id_id_idx" ON "doctor_blocks"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "doctor_blocks_doctor_id_idx" ON "doctor_blocks"("doctor_id");

-- AddForeignKey
ALTER TABLE "doctor_blocks" ADD CONSTRAINT "doctor_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_blocks" ADD CONSTRAINT "doctor_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
