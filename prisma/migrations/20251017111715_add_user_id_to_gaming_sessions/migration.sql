/*
  Warnings:

  - You are about to drop the column `audio_file_path` on the `gaming_sessions` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `gaming_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "gaming_sessions" DROP CONSTRAINT "gaming_sessions_upload_id_fkey";

-- Step 1: Drop the deprecated audio_file_path column
ALTER TABLE "gaming_sessions" DROP COLUMN "audio_file_path";

-- Step 2: Add user_id column as nullable first
ALTER TABLE "gaming_sessions" ADD COLUMN "user_id" TEXT;

-- Step 3: Populate user_id from the campaign relationship
UPDATE "gaming_sessions" gs
SET "user_id" = c.user_id
FROM campaigns c
WHERE gs.campaign_id = c.id;

-- Step 4: Make user_id required (NOT NULL)
ALTER TABLE "gaming_sessions" ALTER COLUMN "user_id" SET NOT NULL;

-- Step 5: Add foreign key constraints
ALTER TABLE "gaming_sessions" ADD CONSTRAINT "gaming_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gaming_sessions" ADD CONSTRAINT "gaming_sessions_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
