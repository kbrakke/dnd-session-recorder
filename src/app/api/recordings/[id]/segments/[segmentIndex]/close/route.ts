import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  captureRejected,
  recorderTokenFrom,
  recordingError,
  recordingValidationError,
  requireRecorderToken,
  requireRecordingOwner,
} from '@/lib/route-utils';
import { CaptureRejectedError, closeSegment, getSegment } from '@/services/recording';

const closeSegmentSchema = z.object({
  partCount: z.number().int().min(1).max(100000),
});

/**
 * POST /api/recordings/[id]/segments/[segmentIndex]/close
 * Declare the segment complete with its final part count. If the server's
 * ledger disagrees, the missing part indexes come back (code
 * 'parts_missing') so the client can re-upload them from its local buffer.
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
    return recordingError(400, 'invalid_request', 'Invalid segment index');
  }

  const segment = await getSegment(recording.id, segmentIndex);
  if (!segment) {
    return recordingError(404, 'segment_not_found', 'Segment not found');
  }
  if (segment.status === 'closed') {
    return NextResponse.json({ segment: { index: segment.index, status: 'closed' } });
  }

  let body: z.infer<typeof closeSegmentSchema>;
  try {
    body = closeSegmentSchema.parse(await request.json());
  } catch (parseError) {
    const validation = recordingValidationError(parseError);
    if (validation) return validation;
    return recordingError(400, 'invalid_request', 'Invalid JSON body');
  }

  try {
    const result = await closeSegment(segment, body.partCount, recorderTokenFrom(request));
    if (!result.ok) {
      return recordingError(409, 'parts_missing', 'Parts missing from segment', {
        missing: result.missing,
      });
    }
  } catch (err) {
    if (err instanceof CaptureRejectedError) return captureRejected(err);
    throw err;
  }

  return NextResponse.json({ segment: { index: segment.index, status: 'closed' } });
}
