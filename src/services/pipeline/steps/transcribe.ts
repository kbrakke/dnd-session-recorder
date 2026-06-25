import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { db } from '@/services/database';
import { splitAudioBySize, cleanupChunkFiles } from '@/services/audioProcessing';
import { ensureLocalAudio, cleanupWorkFile } from '@/services/storage';
import { transcribeAudio } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { PermanentJobError } from '../errors';
import { StepContext, assertActive, withTimeout } from '../util';

const CHUNK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes per chunk

function chunkProgress(completed: number, total: number): number {
  // 10-90% of the bar is reserved for chunk transcription
  return Math.floor(10 + (completed / total) * 80);
}

/**
 * Transcribe the session's audio with per-chunk durable checkpoints.
 *
 * Chunk texts are persisted to transcript_chunks as each Whisper call
 * finishes. If the worker dies (deploy, OOM, machine stop) the retried job
 * re-splits the audio but only transcribes chunks that have no saved text —
 * completed Whisper work is never repeated.
 */
export async function runTranscribeStep(sessionId: string, ctx: StepContext): Promise<void> {
  const session = await db.getSessionById(sessionId);
  if (!session) {
    throw new PermanentJobError('Session no longer exists');
  }

  // Checkpoint: transcription already saved -> nothing to do.
  const existing = await db.getTranscriptions(sessionId);
  if (existing.length > 0) {
    if (!['transcribed', 'summarizing', 'completed'].includes(session.status)) {
      await db.updateSession(sessionId, { status: 'transcribed' });
    }
    logger.info('Transcription already exists, skipping step', { sessionId });
    return;
  }

  if (!session.upload) {
    throw new PermanentJobError(
      'No audio file linked to this session. Upload an audio file and re-run processing.'
    );
  }

  // Fetch the audio from the storage backend (Tigris object storage in
  // production — durable across restarts/machines; local disk in dev).
  const audio = await ensureLocalAudio(session.upload);
  if (!audio) {
    // Deliberately non-destructive: keep the upload/session records so the
    // user can see what happened and re-upload.
    throw new PermanentJobError(
      `Audio for this session could not be found in storage (${session.upload.storageKey}). Please re-upload the audio file and re-run processing.`
    );
  }
  const fullPath = audio.localPath;

  await db.startProcessing(sessionId);
  await db.updateSession(sessionId, { status: 'transcribing' });

  let chunkRows = await prisma.transcriptChunk.findMany({
    where: { sessionId },
    orderBy: { chunkIndex: 'asc' },
  });
  const allChunksDone =
    chunkRows.length > 0 && chunkRows.every(c => c.status === 'completed' && c.text !== null);

  let chunkPaths: string[] = [];

  if (!allChunksDone) {
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'chunking',
      transcriptionProgress: 5,
    });

    // Re-splitting on resume is cheap (ffmpeg, local CPU) compared to
    // re-transcribing (Whisper, paid). Chunk file names are deterministic.
    // Chunks go to a temp work dir so the durable original is never touched.
    const chunkDir = path.join(os.tmpdir(), 'dnd-audio-work', sessionId);
    fs.mkdirSync(chunkDir, { recursive: true });
    const chunks = await splitAudioBySize(fullPath, { maxChunkSizeMB: 18, outputDir: chunkDir });
    chunkPaths = chunks.map(c => c.path);
    logger.info('Audio split into chunks', { sessionId, chunkCount: chunks.length });

    if (chunkRows.length !== chunks.length) {
      // First run, or the linked audio changed since the last attempt.
      await prisma.$transaction([
        prisma.transcriptChunk.deleteMany({ where: { sessionId } }),
        prisma.transcriptChunk.createMany({
          data: chunks.map(c => ({
            sessionId,
            chunkIndex: c.index,
            totalChunks: chunks.length,
          })),
        }),
      ]);
      chunkRows = await prisma.transcriptChunk.findMany({
        where: { sessionId },
        orderBy: { chunkIndex: 'asc' },
      });
    }

    let completed = chunkRows.filter(c => c.status === 'completed').length;
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'transcribing',
      totalChunks: chunkRows.length,
      chunksCompleted: completed,
      transcriptionProgress: chunkProgress(completed, chunkRows.length),
    });

    try {
      for (const row of chunkRows) {
        if (row.status === 'completed' && row.text !== null) {
          continue; // checkpointed on a previous attempt
        }
        assertActive(ctx);

        const fileBuffer = fs.readFileSync(chunkPaths[row.chunkIndex]);
        const transcription = await withTimeout(
          transcribeAudio(fileBuffer),
          CHUNK_TIMEOUT_MS,
          `Transcription timeout: chunk ${row.chunkIndex + 1}/${chunkRows.length} took longer than 30 minutes`
        );

        if (!transcription.text) {
          throw new Error(`No transcription text received for chunk ${row.chunkIndex + 1}`);
        }

        // Durable checkpoint: chunk text survives worker death.
        await prisma.transcriptChunk.update({
          where: { id: row.id },
          data: { text: transcription.text, status: 'completed' },
        });

        completed += 1;
        logger.info('Chunk transcribed', {
          sessionId,
          chunkNumber: row.chunkIndex + 1,
          totalChunks: chunkRows.length,
        });
        await db.updateTranscriptionProgress(sessionId, {
          chunksCompleted: completed,
          transcriptionProgress: chunkProgress(completed, chunkRows.length),
        });
      }
    } catch (error) {
      // Remove chunk files so retries don't leak disk; texts already
      // transcribed are safe in transcript_chunks.
      cleanupChunkFiles(chunkPaths, fullPath);
      throw error;
    }
  }

  assertActive(ctx);
  await db.updateTranscriptionProgress(sessionId, {
    currentStep: 'stitching',
    transcriptionProgress: 90,
  });

  const finalRows = await prisma.transcriptChunk.findMany({
    where: { sessionId },
    orderBy: { chunkIndex: 'asc' },
  });
  const fullText = finalRows.map(r => r.text ?? '').join(' ');

  await db.saveTranscription(sessionId, fullText);
  // Chunk checkpoints are redundant once the stitched transcription exists.
  await prisma.transcriptChunk.deleteMany({ where: { sessionId } });
  if (chunkPaths.length > 0) {
    cleanupChunkFiles(chunkPaths, fullPath);
  }
  logger.info('Transcription saved', { sessionId, textLength: fullText.length });

  await db.updateTranscriptionProgress(sessionId, {
    currentStep: 'completed',
    transcriptionProgress: 100,
  });
  await db.updateSession(sessionId, { status: 'transcribed' });

  if (session.uploadId) {
    // The original audio is deliberately KEPT in storage so the session stays
    // playable in the browser.
    await db.updateUploadStatus(session.uploadId, 'transcribed');
  }

  // Remove the temp working copy downloaded from object storage (no-op for
  // local-backend originals).
  await cleanupWorkFile(fullPath, audio.isTemp);
}
