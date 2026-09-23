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
import { CaptureRejectedError, openSegment } from '@/services/recording';

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
    return notCapturing();
  }

  let body: z.infer<typeof openSegmentSchema>;
  try {
    body = openSegmentSchema.parse(await request.json());
  } catch (parseError) {
    const validation = recordingValidationError(parseError);
    if (validation) return validation;
    return recordingError(400, 'invalid_request', 'Invalid JSON body');
  }

  try {
    const segment = await openSegment(recording.id, body.index, recorderTokenFrom(request));
    if (segment === 'gap') {
      return recordingError(409, 'segment_gap', 'Segment index out of order');
    }
    return NextResponse.json({
      segment: { index: segment.index, status: segment.status },
    });
  } catch (err) {
    if (err instanceof CaptureRejectedError) return captureRejected(err);
    throw err;
  }
}
