-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_pic_user_id_fkey";

-- DropForeignKey
ALTER TABLE "doctor_blocks" DROP CONSTRAINT "doctor_blocks_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "doctor_blocks" DROP CONSTRAINT "doctor_blocks_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "doctor_shifts" DROP CONSTRAINT "doctor_shifts_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "doctor_shifts" DROP CONSTRAINT "doctor_shifts_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_user_id_fkey";

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT "patients_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_clinic_id_fkey";

-- DropIndex
DROP INDEX "appointments_code_key";

-- DropIndex
DROP INDEX "branches_code_key";

-- DropIndex
DROP INDEX "clinics_code_key";

-- DropIndex
DROP INDEX "doctors_code_key";

-- DropIndex
DROP INDEX "patients_code_key";

-- AlterTable
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_pkey",
DROP COLUMN "code",
ADD COLUMN     "appointment_code" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
DROP COLUMN "patient_id",
ADD COLUMN     "patient_id" UUID NOT NULL,
DROP COLUMN "doctor_id",
ADD COLUMN     "doctor_id" UUID NOT NULL,
ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "branches" DROP CONSTRAINT "branches_pkey",
DROP COLUMN "code",
ADD COLUMN     "branch_code" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
DROP COLUMN "pic_user_id",
ADD COLUMN     "pic_user_id" UUID,
ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "clinics" DROP CONSTRAINT "clinics_pkey",
DROP COLUMN "code",
ADD COLUMN     "clinic_code" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "doctor_blocks" DROP CONSTRAINT "doctor_blocks_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "doctor_id",
ADD COLUMN     "doctor_id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
ADD CONSTRAINT "doctor_blocks_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "doctor_shifts" DROP CONSTRAINT "doctor_shifts_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "doctor_id",
ADD COLUMN     "doctor_id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
ADD CONSTRAINT "doctor_shifts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_pkey",
DROP COLUMN "code",
ADD COLUMN     "doctor_code" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
DROP COLUMN "branch_id",
ADD COLUMN     "branch_id" UUID,
ADD CONSTRAINT "doctors_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "patients" DROP CONSTRAINT "patients_pkey",
DROP COLUMN "code",
ADD COLUMN     "patient_code" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID NOT NULL,
ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clinic_id",
ADD COLUMN     "clinic_id" UUID,
DROP COLUMN "branch_id",
ADD COLUMN     "branch_id" UUID,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_appointment_code_key" ON "appointments"("appointment_code");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_id_idx" ON "appointments"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_start_time_idx" ON "appointments"("clinic_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_start_time_idx" ON "appointments"("doctor_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branch_code_key" ON "branches"("branch_code");

-- CreateIndex
CREATE INDEX "branches_clinic_id_id_idx" ON "branches"("clinic_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_clinic_code_key" ON "clinics"("clinic_code");

-- CreateIndex
CREATE INDEX "doctor_blocks_clinic_id_id_idx" ON "doctor_blocks"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "doctor_blocks_doctor_id_idx" ON "doctor_blocks"("doctor_id");

-- CreateIndex
CREATE INDEX "doctor_shifts_clinic_id_id_idx" ON "doctor_shifts"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "doctor_shifts_doctor_id_idx" ON "doctor_shifts"("doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_doctor_code_key" ON "doctors"("doctor_code");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE INDEX "doctors_clinic_id_id_idx" ON "doctors"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "doctors_branch_id_idx" ON "doctors"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_patient_code_key" ON "patients"("patient_code");

-- CreateIndex
CREATE INDEX "patients_clinic_id_id_idx" ON "patients"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "patients_clinic_id_created_at_idx" ON "patients"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "users_clinic_id_id_idx" ON "users"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "users_clinic_id_created_at_idx" ON "users"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_pic_user_id_fkey" FOREIGN KEY ("pic_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_blocks" ADD CONSTRAINT "doctor_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_blocks" ADD CONSTRAINT "doctor_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

