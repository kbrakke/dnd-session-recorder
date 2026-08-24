-- Live in-browser recording: recordings + segments + parts
-- (docs/LIVE_RECORDING_DESIGN.md §4). Guarded so partial/manual recovery
-- states don't wedge the migration; constraint names match Prisma defaults.

-- CreateTable
CREATE TABLE IF NOT EXISTS "recordings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "mime_type" TEXT NOT NULL,
    "recorder_token" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_upload_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recording_segments" (
    "id" TEXT NOT NULL,
    "recording_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "part_count" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recording_parts" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recordings_session_id_key" ON "recordings"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recordings_user_id_status_idx" ON "recordings"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recording_segments_recording_id_index_key" ON "recording_segments"("recording_id", "index");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recording_parts_segment_id_index_key" ON "recording_parts"("segment_id", "index");

-- AddForeignKey (no IF NOT EXISTS for constraints; guard via catalog check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recordings_session_id_fkey'
  ) THEN
    ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "gaming_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recordings_user_id_fkey'
  ) THEN
    ALTER TABLE "recordings" ADD CONSTRAINT "recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recording_segments_recording_id_fkey'
  ) THEN
    ALTER TABLE "recording_segments" ADD CONSTRAINT "recording_segments_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recording_parts_segment_id_fkey'
  ) THEN
    ALTER TABLE "recording_parts" ADD CONSTRAINT "recording_parts_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "recording_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
