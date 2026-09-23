import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recorderTokenFrom, recordingError, requireRecordingOwner } from '@/lib/route-utils';
import { beginFinalize, revertFinalize } from '@/services/recording';
import { enqueueFinalizeRecording } from '@/services/pipeline/queue';
import { logger } from '@/lib/logger';

const finalizeSchema = z.object({ force: z.boolean().optional() });

/**
 * POST /api/recordings/[id]/finalize  body: { force?: boolean }
 *
 * Assemble everything captured into a normal uploaded session (durable
 * worker job). Used by Stop (which sends its `x-recorder-token`) and by the
 * recovery card's "Finalize what's there" / retry-after-failure, which run in
 * another tab. A LIVE recording (fresh heartbeat) can only be finalized by
 * the capturing tab or with `force: true` after the user confirms — the
 * guard returns 409 code 'still_capturing' with `lastHeartbeatAt`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  const parsed = finalizeSchema.safeParse(await request.json().catch(() => ({})));
  const force = parsed.success ? !!parsed.data.force : false;

  const previousStatus = recording.status;
  const outcome = await beginFinalize(recording, {
    recorderToken: recorderTokenFrom(request),
    force,
  });
  if (outcome === 'conflict') {
    return recordingError(409, 'already_finalizing', 'Recording is already finalizing or finalized');
  }
  if (outcome === 'empty') {
    return recordingError(400, 'nothing_captured', 'No audio was captured — nothing to finalize');
  }
  if (typeof outcome === 'object') {
    return recordingError(409, 'still_capturing', 'Recording is still capturing', {
      lastHeartbeatAt: outcome.lastHeartbeatAt,
    });
  }

  const { job } = await enqueueFinalizeRecording(recording.sessionId);
  if (job.type !== 'finalize_recording') {
    // Per-session enqueue idempotency handed back some OTHER active job;
    // reporting 'finalizing' now would leave the recording stuck with no
    // finalize job to service it.
    await revertFinalize(recording.id, previousStatus);
    logger.warn('Finalize refused: another pipeline job is active for the session', {
      recordingId: recording.id,
      sessionId: recording.sessionId,
      activeJobId: job.id,
      activeJobType: job.type,
    });
    return recordingError(409, 'past_capture', 'Another processing job is active for this session');
  }

  logger.info('Recording finalize enqueued', {
    recordingId: recording.id,
    sessionId: recording.sessionId,
    jobId: job.id,
    forced: force,
  });

  return NextResponse.json({ status: 'finalizing', jobId: job.id });
}
