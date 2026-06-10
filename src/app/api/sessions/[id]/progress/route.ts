import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { getLatestJob } from '@/services/pipeline/queue';
import { logger } from '@/lib/logger';

// GET /api/sessions/[id]/progress - Get session progress
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const sessionId = (await params).id;

    // Get session with progress information
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if user owns the campaign this session belongs to
    const campaign = await db.getCampaignById(session.campaignId);
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
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
