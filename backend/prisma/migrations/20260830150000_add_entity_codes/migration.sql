-- Monotonic counters backing the human-friendly display codes.
CREATE TABLE "counters" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "counters_pkey" PRIMARY KEY ("name")
);

-- Nullable display codes (backfilled by the app on create / re-seed).
ALTER TABLE "clinics" ADD COLUMN "code" TEXT;
ALTER TABLE "patients" ADD COLUMN "code" TEXT;
ALTER TABLE "doctors" ADD COLUMN "code" TEXT;
ALTER TABLE "appointments" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "clinics_code_key" ON "clinics"("code");
CREATE UNIQUE INDEX "patients_code_key" ON "patients"("code");
CREATE UNIQUE INDEX "doctors_code_key" ON "doctors"("code");
CREATE UNIQUE INDEX "appointments_code_key" ON "appointments"("code");
