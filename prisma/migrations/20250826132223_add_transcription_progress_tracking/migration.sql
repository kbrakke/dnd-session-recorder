-- AlterTable
ALTER TABLE "gaming_sessions" ADD COLUMN     "chunks_completed" INTEGER DEFAULT 0,
ADD COLUMN     "current_step" TEXT,
ADD COLUMN     "total_chunks" INTEGER,
ADD COLUMN     "transcription_progress" INTEGER DEFAULT 0;
