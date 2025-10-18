-- AlterTable
ALTER TABLE "gaming_sessions" ADD COLUMN     "last_error" TIMESTAMP(3),
ADD COLUMN     "last_progress_at" TIMESTAMP(3),
ADD COLUMN     "processing_started_at" TIMESTAMP(3);
