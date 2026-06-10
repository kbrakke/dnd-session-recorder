import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { prisma } from '@/lib/prisma';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { enqueueProcessSession, cancelActiveJobs } from '@/services/pipeline/queue';
import { audioExists } from '@/services/storage';
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
    await request.json().catch(() => ({})); // Read body to prevent stream errors

    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // COST PROTECTION: Block test accounts from making real AI API calls.
    // Skipped when AI is mocked — no spend, so the pipeline can be tested.
    if (isTestAccount(user.email!) && !isAiMocked()) {
      logger.warn('Blocked test account from transcription', {
        sessionId,
        userEmail: user.email
      });

      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI transcription services. Please use a real email address to access this feature.',
          isTestAccount: true
        },
        { status: 403 }
      );
    }

    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // IDEMPOTENCY: Check if transcription already exists
    const existingTranscriptions = await db.getTranscriptions(sessionId);
    if (existingTranscriptions && existingTranscriptions.length > 0) {
      logger.info('Transcription already exists, skipping', { sessionId });

      if (session.status !== 'transcribed' && session.status !== 'completed') {
        await db.updateSession(sessionId, { status: 'transcribed' });
      }

      return NextResponse.json({
        message: 'Transcription already exists',
        transcriptionLength: existingTranscriptions[0].text.length,
        skipped: true
      });
    }

    if (!session.upload) {
      return NextResponse.json(
        { error: 'No audio file found for this session. Please upload an audio file first.' },
        { status: 400 }
      );
    }

    if (!(await audioExists(session.upload))) {
      logger.warn('Audio not found in storage', {
        sessionId,
        storageKey: session.upload.storageKey,
        path: session.upload.path
      });

      // Destructive reconciliation applies ONLY to legacy local-disk uploads
      // (no storageKey) — those files are genuinely unrecoverable. Object
      // storage uploads keep their records; a missing object is surfaced
      // without deleting anything.
      if (!session.upload.storageKey) {
        try {
          logger.info('Removing upload record for missing legacy file', {
            sessionId,
            uploadId: session.upload.id
          });
          await db.deleteUpload(session.upload.id);

          // Clear the session's upload link and revert to draft status
          await db.updateSession(sessionId, {
            uploadId: null,
            status: 'draft'
          });

          logger.info('Cleaned up database records for missing file', { sessionId });
        } catch (cleanupError) {
          logger.error('File reconciliation cleanup failed', cleanupError as Error, { sessionId });
        }

        return NextResponse.json(
          {
            error: `Audio file not found at path: ${session.upload.path}. Database records have been cleaned up. Please re-upload the file.`,
            fileReconciled: true
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: 'Audio is missing from object storage. Please re-upload the file.',
        },
        { status: 404 }
      );
    }

    const { job } = await enqueueProcessSession(sessionId);
    await db.clearSessionError(sessionId);
    await db.updateSession(sessionId, { status: 'transcribing' });

    logger.info('Transcription queued', { sessionId, jobId: job.id });

    return NextResponse.json({
      message: 'Transcription queued',
      jobId: job.id,
      queued: true,
    }, { status: 202 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to queue transcription', error as Error, { sessionId });

    return NextResponse.json(
      {
        error: 'Failed to queue transcription',
        details: errorMessage,
        canRetry: true,
      },
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
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    const transcriptions = await db.getTranscriptions(sessionId);

    return NextResponse.json(transcriptions);
  } catch (error) {
    logger.error('Failed to fetch transcriptions', error as Error);

    return NextResponse.json(
      { error: 'Failed to fetch transcriptions' },
      { status: 500 }
    );
  }
}

// DELETE /api/transcription/[sessionId] - Cancel transcription
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const { isTimedOut, minutesElapsed } = await db.checkProcessingTimeout(sessionId, 30);

    // Cancel the active pipeline job (the worker aborts at its next chunk
    // boundary), drop chunk checkpoints, and reset the session state.
    const cancelledJobs = await cancelActiveJobs(sessionId);
    await prisma.transcriptChunk.deleteMany({ where: { sessionId } });
    await db.cancelTranscription(sessionId);

    logger.info('Transcription cancelled', {
      sessionId,
      cancelledJobs,
      minutesElapsed,
      wasTimedOut: isTimedOut
    });

    return NextResponse.json({
      message: 'Transcription cancelled successfully',
      wasTimedOut: isTimedOut,
      minutesElapsed,
    });
  } catch (error) {
    logger.error('Failed to cancel transcription', error as Error);

    return NextResponse.json(
      { error: 'Failed to cancel transcription' },
      { status: 500 }
    );
  }
}
