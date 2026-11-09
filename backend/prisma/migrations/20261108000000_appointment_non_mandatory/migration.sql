ALTER TABLE "appointments"
ADD COLUMN "non_mandatory" BOOLEAN NOT NULL DEFAULT false;

-- No-time appointments already reopen with the skip option checked.
-- The original choice cannot be recovered for older timed appointments.
UPDATE "appointments"
SET "non_mandatory" = true
WHERE "start_time" = "end_time";
