import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  captureRejected,
  notCapturing,
  recorderTokenFrom,
  recordingError,
  recordingValidationError,
  requireRecorderToken,
  requireRecordingOwner,
} from '@/lib/route-utils';
import { CaptureRejectedError, heartbeatRecording } from '@/services/recording';

const heartbeatSchema = z.object({
  state: z.enum(['recording', 'paused']),
});

/**
 * PUT /api/recordings/[id]/heartbeat
 * ~15s liveness ping carrying the client's current state — the ONLY way
 * pause/resume reaches the server. Written with the DB clock, conditional on
 * the current token; staleness is what derives 'interrupted'. Deliberately
 * NOT rate-limited beyond auth (see docs/LIVE_RECORDING_DESIGN.md §5).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  const tokenError = requireRecorderToken(request, recording);
  if (tokenError) return tokenError;

  if (recording.status !== 'recording' && recording.status !== 'paused') {
    return notCapturing();
  }

  let body: z.infer<typeof heartbeatSchema>;
  try {
    body = heartbeatSchema.parse(await request.json());
  } catch (parseError) {
    const validation = recordingValidationError(parseError);
    if (validation) return validation;
    return recordingError(400, 'invalid_request', 'Invalid JSON body');
  }

  try {
    await heartbeatRecording(recording.id, body.state, recorderTokenFrom(request));
  } catch (err) {
    if (err instanceof CaptureRejectedError) return captureRejected(err);
    throw err;
  }
  return NextResponse.json({ received: true });
}
