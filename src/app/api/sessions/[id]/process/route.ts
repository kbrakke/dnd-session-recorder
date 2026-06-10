import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { enqueueProcessSession } from '@/services/pipeline/queue';
import { logger } from '@/lib/logger';

/**
 * POST /api/sessions/[id]/process
 *
 * Enqueues a durable processing job for the session. The in-process pipeline
 * worker (see src/services/pipeline/worker.ts) picks the job up and runs
 * transcribe -> summarize -> dm-todo with per-step checkpoints, retries with
 * backoff, and crash recovery via lease reaping.
 *
 * Idempotent: at most one active job exists per session. Re-posting while a
 * job is waiting out a retry backoff makes it immediately runnable again.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const session = await db.getSessionById(sessionId);
    if (!session || session.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // COST PROTECTION: the worker runs without request context, so the test
    // account check must happen here at enqueue time.
    if (isTestAccount(user.email!) && !isAiMocked()) {
      logger.warn('Blocked test account from processing pipeline', {
        sessionId,
        userEmail: user.email,
      });
      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI processing services. Please use a real email address to access this feature.',
          isTestAccount: true,
        },
        { status: 403 }
      );
    }

    const hasTranscription = session.transcriptions.length > 0;
    const hasSummary = !!session.summary;
    const hasDmTodo = !!(await db.getDmTodoList(sessionId));

    if (session.status === 'completed' && hasTranscription && hasSummary && hasDmTodo) {
      return NextResponse.json({
        message: 'Session already completed',
        status: 'completed',
        session,
      });
    }

    if (!session.uploadId && !hasTranscription) {
      return NextResponse.json(
        {
          error: 'Session has no audio file linked. Please upload an audio file first.',
          status: 'draft',
          needsUpload: true,
        },
        { status: 400 }
      );
    }

    const { job, created } = await enqueueProcessSession(sessionId);

    if (!created && job.status === 'running') {
      return NextResponse.json({
        message: 'Session is currently being processed',
        status: session.status,
        jobId: job.id,
        session,
      });
    }

    // Optimistic status so the UI starts polling right away; the worker
    // re-asserts these as it actually enters each step.
    const nextStatus = hasTranscription ? 'summarizing' : 'transcribing';
    await db.clearSessionError(sessionId);
    await db.updateSession(sessionId, { status: nextStatus });

    logger.info('Processing job enqueued', { sessionId, jobId: job.id, created });

    return NextResponse.json({
      message: hasTranscription ? 'Summary generation started' : 'Transcription started',
      status: nextStatus,
      step: hasTranscription ? 'summary' : 'transcription',
      jobId: job.id,
      session: await db.getSessionById(sessionId),
    });
  } catch (error) {
    logger.error('Failed to enqueue processing job', error as Error, { sessionId });
    return NextResponse.json(
      { error: 'Failed to process session', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
