-- Postgres does not index FK columns automatically. These back the hot
-- per-user/per-session lookups (session lists, transcript fetches, upload
-- lists). IF NOT EXISTS keeps the migration safe to re-run on a partially
-- recovered database.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gaming_sessions_user_id_idx" ON "gaming_sessions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gaming_sessions_campaign_id_idx" ON "gaming_sessions"("campaign_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transcriptions_session_id_idx" ON "transcriptions"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "uploads_user_id_idx" ON "uploads"("user_id");
