-- Drop legacy local-disk columns now that every upload carries a storage_key.
-- `path` held an absolute filesystem path on pre-object-storage rows; chunk
-- files are temp-only in the durable pipeline and never persisted.
ALTER TABLE "uploads" DROP COLUMN IF EXISTS "path";
ALTER TABLE "uploads" DROP COLUMN IF EXISTS "chunk_paths";

-- Backfill any legacy rows that predate object storage so the column can be
-- made NOT NULL. These keys do NOT point at a real object (the original local
-- file is gone) — the app surfaces a "please re-upload" error if such audio is
-- ever processed. On a fresh database this updates zero rows.
UPDATE "uploads" SET "storage_key" = 'legacy/' || "id" WHERE "storage_key" IS NULL;

-- Every upload now has a storage_key.
ALTER TABLE "uploads" ALTER COLUMN "storage_key" SET NOT NULL;
