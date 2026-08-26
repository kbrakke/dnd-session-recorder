import { NextResponse } from 'next/server';
import { requireRecordingOwner } from '@/lib/route-utils';
import { beginFinalize } from '@/services/recording';
import { enqueueFinalizeRecording } from '@/services/pipeline/queue';
import { logger } from '@/lib/logger';

/**
 * POST /api/recordings/[id]/finalize
 *
 * Assemble everything captured into a normal uploaded session (durable
 * worker job). Used by Stop AND by the recovery card's "Finalize what's
 * there" / retry-after-failure — which run in a fresh tab, so no recorder
 * token is required (ownership + auth suffice; finalizing is not
 * destructive).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  const outcome = await beginFinalize(recording);
  if (outcome === 'conflict') {
    return NextResponse.json(
      { error: 'Recording is already finalizing or finalized' },
      { status: 409 }
    );
  }
  if (outcome === 'empty') {
    return NextResponse.json(
      { error: 'No audio was captured — nothing to finalize' },
      { status: 400 }
    );
  }

  const { job } = await enqueueFinalizeRecording(recording.sessionId);
  logger.info('Recording finalize enqueued', {
    recordingId: recording.id,
    sessionId: recording.sessionId,
    jobId: job.id,
  });

  return NextResponse.json({ status: 'finalizing', jobId: job.id });
}
