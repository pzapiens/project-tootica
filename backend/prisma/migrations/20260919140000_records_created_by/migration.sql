-- Track the creator/uploader on each records row (creator-only edit/delete;
-- uploader shown on document cards). Nullable — legacy rows have no creator.
ALTER TABLE "tooth_remarks"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "created_by_name" TEXT;

ALTER TABLE "medical_history_entries"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "created_by_name" TEXT;

ALTER TABLE "observation_entries"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "created_by_name" TEXT;

ALTER TABLE "patient_documents"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "created_by_name" TEXT;
