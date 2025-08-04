-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "system_prompt" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "gaming_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_summaries" ("characters_involved", "created_at", "edited_at", "id", "is_edited", "key_events", "original_text", "session_id", "summary_text", "updated_at") SELECT "characters_involved", "created_at", "edited_at", "id", "is_edited", "key_events", "original_text", "session_id", "summary_text", "updated_at" FROM "summaries";
DROP TABLE "summaries";
ALTER TABLE "new_summaries" RENAME TO "summaries";
CREATE UNIQUE INDEX "summaries_session_id_key" ON "summaries"("session_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
