import { NextRequest, NextResponse } from 'next/server';
import { getLatestJob } from '@/services/pipeline/queue';
import { requireAuth } from '@/lib/auth-utils';
import { notFound } from '@/lib/route-utils';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

// GET /api/sessions/[id]/progress - Get session progress
//
// This is the frontend's polling endpoint while the pipeline runs, so it uses
// a lightweight ownership check (no transcript/summary include) instead of
// requireSessionOwner, which loads the full session graph on every poll.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    const { error, user } = await requireAuth();
    if (error) return error;

    const session = await db.getSessionProgress(sessionId);
    if (!session || session.userId !== user.id) {
      return notFound('Session not found');
    }

    const job = await getLatestJob(sessionId);

    // Return progress information
    return NextResponse.json({
      status: session.status,
      duration: session.duration,
      transcriptionProgress: session.transcriptionProgress || 0,
      totalChunks: session.totalChunks || 0,
      chunksCompleted: session.chunksCompleted || 0,
      currentStep: session.currentStep || null,
      errorStep: session.errorStep || null,
      errorMessage: session.errorMessage || null,
      job: job
        ? {
            id: job.id,
            status: job.status,
            step: job.currentStep,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            nextRunAt: job.status === 'pending' ? job.runAfter : null,
            lastError: job.lastError,
          }
        : null,
    });
  } catch (error) {
    logger.error('Failed to fetch session progress', error as Error);
    return NextResponse.json(
      { error: 'Failed to fetch session progress' },
      { status: 500 }
    );
  }
}
