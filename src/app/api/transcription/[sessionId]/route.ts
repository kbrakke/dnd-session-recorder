import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/services/database';
import { prisma } from '@/lib/prisma';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { enqueueProcessSession, cancelActiveJobs } from '@/services/pipeline/queue';
import { audioExists } from '@/services/storage';
import { requireSessionOwner, enforceRateLimit } from '@/lib/route-utils';
import { aiTranscriptionRateLimiter } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

// POST /api/transcription/[sessionId] - Queue transcription for a session.
//
// Transcription itself runs in the durable pipeline worker (per-chunk
// checkpoints, retries, crash recovery) — never inside an HTTP request.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error: authError, user, session } = await requireSessionOwner(sessionId);
    if (authError) return authError;

    const limited = enforceRateLimit(request, user.id, aiTranscriptionRateLimiter);
    if (limited) return limited;

    // COST PROTECTION: Block test accounts from real AI calls (skipped when mocked).
    if (isTestAccount(user.email!) && !isAiMocked()) {
      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI transcription services. Please use a real email address to access this feature.',
          isTestAccount: true,
        },
        { status: 403 }
      );
    }

    const existingTranscriptions = await db.getTranscriptions(sessionId);
    if (existingTranscriptions.length > 0) {
      if (session.status !== 'transcribed' && session.status !== 'completed') {
        await db.updateSession(sessionId, { status: 'transcribed' });
      }
      return NextResponse.json({
        message: 'Transcription already exists',
        transcriptionLength: existingTranscriptions[0].text.length,
        skipped: true,
      });
    }

    if (!session.upload) {
      return NextResponse.json(
        { error: 'No audio file found for this session. Please upload an audio file first.' },
        { status: 400 }
      );
    }

    if (!(await audioExists(session.upload))) {
      logger.warn('Audio not found in storage', { sessionId, storageKey: session.upload.storageKey });
      return NextResponse.json(
        { error: 'Audio is missing from storage. Please re-upload the file.' },
        { status: 404 }
      );
    }

    const { job } = await enqueueProcessSession(sessionId);
    await db.clearSessionError(sessionId);
    await db.updateSession(sessionId, { status: 'transcribing' });

    logger.info('Transcription queued', { sessionId, jobId: job.id });

    return NextResponse.json({ message: 'Transcription queued', jobId: job.id, queued: true }, { status: 202 });
  } catch (error) {
    logger.error('Failed to queue transcription', error as Error, { sessionId });
    return NextResponse.json(
      { error: 'Failed to queue transcription', canRetry: true },
      { status: 500 }
    );
  }
}

// GET /api/transcription/[sessionId] - Get transcriptions for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    return NextResponse.json(await db.getTranscriptions(sessionId));
  } catch (error) {
    logger.error('Failed to fetch transcriptions', error as Error);
    return NextResponse.json({ error: 'Failed to fetch transcriptions' }, { status: 500 });
  }
}

// DELETE /api/transcription/[sessionId] - Cancel transcription
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    const { isTimedOut, minutesElapsed } = await db.checkProcessingTimeout(sessionId, 30);

    // Cancel the active pipeline job (the worker aborts at its next chunk
    // boundary), drop chunk checkpoints, and reset the session state.
    const cancelledJobs = await cancelActiveJobs(sessionId);
    await prisma.transcriptChunk.deleteMany({ where: { sessionId } });
    await db.cancelTranscription(sessionId);

    logger.info('Transcription cancelled', { sessionId, cancelledJobs, minutesElapsed, wasTimedOut: isTimedOut });

    return NextResponse.json({
      message: 'Transcription cancelled successfully',
      wasTimedOut: isTimedOut,
      minutesElapsed,
    });
  } catch (error) {
    logger.error('Failed to cancel transcription', error as Error);
    return NextResponse.json({ error: 'Failed to cancel transcription' }, { status: 500 });
  }
}
