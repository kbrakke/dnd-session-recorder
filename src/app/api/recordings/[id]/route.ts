import { NextResponse } from 'next/server';
import { requireRecordingOwner } from '@/lib/route-utils';
import { discardRecording, getRecordingState } from '@/services/recording';

/**
 * GET /api/recordings/[id]
 * Recording state for the HUD and the recovery card ('interrupted' is
 * derived from heartbeat staleness against the DB clock).
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
 * DELETE /api/recordings/[id]
 * Discard: delete part objects and rows, freeing the session to be recorded
 * again. Refused while finalization is running or after it succeeded (the
 * audio is a normal Upload by then — delete that instead).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  if (recording.status === 'finalizing' || recording.status === 'finalized') {
    return NextResponse.json(
      { error: 'Recording has been finalized and can no longer be discarded' },
      { status: 409 }
    );
  }

  await discardRecording(recording);
  return NextResponse.json({ message: 'Recording discarded' });
}
