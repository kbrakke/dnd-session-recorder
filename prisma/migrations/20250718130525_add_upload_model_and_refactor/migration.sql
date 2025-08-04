/*
  Warnings:

  - Added the required column `updated_at` to the `summaries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimetype" TEXT NOT NULL,
    "duration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "chunk_paths" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_gaming_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "session_date" DATETIME NOT NULL,
    "upload_id" TEXT,
    "audio_file_path" TEXT,
    "duration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error_step" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "gaming_sessions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gaming_sessions_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_gaming_sessions" ("audio_file_path", "campaign_id", "created_at", "duration", "error_message", "error_step", "id", "session_date", "status", "title", "updated_at") SELECT "audio_file_path", "campaign_id", "created_at", "duration", "error_message", "error_step", "id", "session_date", "status", "title", "updated_at" FROM "gaming_sessions";
DROP TABLE "gaming_sessions";
ALTER TABLE "new_gaming_sessions" RENAME TO "gaming_sessions";
CREATE TABLE "new_summaries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "key_events" TEXT,
    "characters_involved" TEXT,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" DATETIME,
    "original_text" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "gaming_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_summaries" ("characters_involved", "created_at", "id", "key_events", "session_id", "summary_text", "updated_at") SELECT "characters_involved", "created_at", "id", "key_events", "session_id", "summary_text", "created_at" FROM "summaries";
DROP TABLE "summaries";
ALTER TABLE "new_summaries" RENAME TO "summaries";
CREATE UNIQUE INDEX "summaries_session_id_key" ON "summaries"("session_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
