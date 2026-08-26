import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRecorderToken, requireRecordingOwner, zodErrorResponse } from '@/lib/route-utils';
import { closeSegment, getSegment } from '@/services/recording';

const closeSegmentSchema = z.object({
  partCount: z.number().int().min(1).max(100000),
});

/**
 * POST /api/recordings/[id]/segments/[segmentIndex]/close
 * Declare the segment complete with its final part count. If the server's
 * ledger disagrees, the missing part indexes come back so the client can
 * re-upload them from its local buffer.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; segmentIndex: string }> }
) {
  const { id, segmentIndex: rawSegment } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  const tokenError = requireRecorderToken(request, recording);
  if (tokenError) return tokenError;

  const segmentIndex = Number(rawSegment);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
    return NextResponse.json({ error: 'Invalid segment index' }, { status: 400 });
  }

  const segment = await getSegment(recording.id, segmentIndex);
  if (!segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }
  if (segment.status === 'closed') {
    return NextResponse.json({ segment: { index: segment.index, status: 'closed' } });
  }

  let body: z.infer<typeof closeSegmentSchema>;
  try {
    body = closeSegmentSchema.parse(await request.json());
  } catch (parseError) {
    const zodError = zodErrorResponse(parseError);
    if (zodError) return zodError;
    throw parseError;
  }

  const result = await closeSegment(segment, body.partCount);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Parts missing from segment', missing: result.missing },
      { status: 409 }
    );
  }

  return NextResponse.json({ segment: { index: segment.index, status: 'closed' } });
}
