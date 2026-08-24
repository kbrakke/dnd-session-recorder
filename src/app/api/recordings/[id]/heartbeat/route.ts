import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRecorderToken, requireRecordingOwner, zodErrorResponse } from '@/lib/route-utils';
import { heartbeatRecording } from '@/services/recording';

const heartbeatSchema = z.object({
  state: z.enum(['recording', 'paused']),
});

/**
 * PUT /api/recordings/[id]/heartbeat
 * ~15s liveness ping carrying the client's current state. Written with the
 * DB clock; staleness is what derives 'interrupted'. Deliberately NOT
 * rate-limited beyond auth (see docs/LIVE_RECORDING_DESIGN.md §5).
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
    return NextResponse.json({ error: 'Recording is not capturing' }, { status: 409 });
  }

  let body: z.infer<typeof heartbeatSchema>;
  try {
    body = heartbeatSchema.parse(await request.json());
  } catch (parseError) {
    const zodError = zodErrorResponse(parseError);
    if (zodError) return zodError;
    throw parseError;
  }

  await heartbeatRecording(recording.id, body.state);
  return NextResponse.json({ received: true });
}
