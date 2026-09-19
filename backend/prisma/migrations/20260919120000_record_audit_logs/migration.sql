-- CreateTable
CREATE TABLE "record_audit_logs" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "table" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "previous" TEXT NOT NULL,
    "updated" TEXT,
    "user_id" UUID NOT NULL,
    "user_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "record_audit_logs_clinic_id_patient_id_created_at_idx" ON "record_audit_logs"("clinic_id", "patient_id", "created_at");

-- AddForeignKey
ALTER TABLE "record_audit_logs" ADD CONSTRAINT "record_audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_audit_logs" ADD CONSTRAINT "record_audit_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
