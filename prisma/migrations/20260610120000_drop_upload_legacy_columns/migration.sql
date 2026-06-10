-- Drop legacy local-disk columns now that every upload carries a storage_key.
-- `path` held an absolute filesystem path on pre-object-storage rows; chunk
-- files are temp-only in the durable pipeline and never persisted.
ALTER TABLE "uploads" DROP COLUMN "path";
ALTER TABLE "uploads" DROP COLUMN "chunk_paths";

-- Every upload now has a storage_key.
ALTER TABLE "uploads" ALTER COLUMN "storage_key" SET NOT NULL;
