import { NextResponse } from 'next/server';
import { recorderTokenFrom, recordingError, requireRecordingOwner } from '@/lib/route-utils';
import { discardRecording, getRecordingState } from '@/services/recording';

/**
 * GET /api/recordings/[id]
 * Recording state for the recorder page and the recovery card ('interrupted'
 * is derived from heartbeat staleness against the DB clock). Includes the
 * per-segment ledger the crash drain reconciles against.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  return NextResponse.json({ recording: await getRecordingState(recording) });
}

/**
 * DELETE /api/recordings/[id]   (?force=1 to discard a live recording)
 * Discard: delete part objects and rows, freeing the session to be recorded
 * again. Refused while finalization is running or after it succeeded (the
 * audio is a normal Upload by then — delete that instead), and refused for a
 * LIVE recording unless the caller is the capturing tab or passes force —
 * discarding under a live tab would make its uploads start 404ing.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  if (recording.status === 'finalizing' || recording.status === 'finalized') {
    return recordingError(
      409,
      'cannot_discard',
      'Recording has been finalized and can no longer be discarded'
    );
  }

  const force = new URL(request.url).searchParams.get('force') === '1';
  if (!force && recorderTokenFrom(request) !== recording.recorderToken) {
    const state = await getRecordingState(recording);
    if (state.status === 'recording' || state.status === 'paused') {
      return recordingError(409, 'still_capturing', 'Recording is still capturing', {
        lastHeartbeatAt: state.lastHeartbeatAt,
      });
    }
  }

  await discardRecording(recording);
  return NextResponse.json({ message: 'Recording discarded' });
}
