/*
  Warnings:

  - You are about to drop the column `observation` on the `patients` table. All the data in the column will be lost.
  - You are about to drop the column `observation_updated_at` on the `patients` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_patient_id_fkey";

-- AlterTable
ALTER TABLE "patients" DROP COLUMN "observation",
DROP COLUMN "observation_updated_at";

-- CreateTable
CREATE TABLE "observation_entries" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observation_entries_clinic_id_patient_id_idx" ON "observation_entries"("clinic_id", "patient_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_entries" ADD CONSTRAINT "observation_entries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_entries" ADD CONSTRAINT "observation_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
