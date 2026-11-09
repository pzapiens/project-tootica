BEGIN;

-- Keep the existing pin order while reducing each clinic to five favourites.
UPDATE "clinics"
SET "treatment_favourites" = "treatment_favourites"[1:5]
WHERE cardinality("treatment_favourites") > 5;

ALTER TABLE "clinics"
ALTER COLUMN "treatment_favourites" SET DEFAULT ARRAY['NEW PATIENT CONSULTATION / EXAMINATION', 'REVIEW CONSULTATION / FOLLOW-UP', 'SCALING / PROPHYLAXIS', 'COMPOSITE FILLING - POSTERIOR', 'ROOT CANAL TREATMENT - MOLAR']::TEXT[];

ALTER TABLE "clinics"
ADD CONSTRAINT "clinics_treatment_favourites_max_five"
CHECK (cardinality("treatment_favourites") <= 5);

COMMIT;
