import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRecorderToken, requireRecordingOwner, zodErrorResponse } from '@/lib/route-utils';
import { openSegment } from '@/services/recording';

const openSegmentSchema = z.object({
  index: z.number().int().min(0).max(9999),
});

/**
 * POST /api/recordings/[id]/segments
 * Open segment N (one continuous MediaRecorder run). Indexes are gapless
 * per recording; retrying a lost response is idempotent.
 */
export async function POST(
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

  let body: z.infer<typeof openSegmentSchema>;
  try {
    body = openSegmentSchema.parse(await request.json());
  } catch (parseError) {
    const zodError = zodErrorResponse(parseError);
    if (zodError) return zodError;
    throw parseError;
  }

  const segment = await openSegment(recording.id, body.index);
  if (segment === 'gap') {
    return NextResponse.json(
      { error: 'Segment index out of order' },
      { status: 409 }
    );
  }

  return NextResponse.json({
    segment: { index: segment.index, status: segment.status },
  });
}
