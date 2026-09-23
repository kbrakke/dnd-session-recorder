import { NextResponse } from 'next/server';
import {
  captureRejected,
  notCapturing,
  recorderTokenFrom,
  recordingError,
  requireRecorderToken,
  requireRecordingOwner,
} from '@/lib/route-utils';
import {
  CaptureRejectedError,
  MAX_PART_BYTES,
  MAX_RECORDING_BYTES,
  getPart,
  getSegment,
  recordingTotalBytes,
  savePart,
} from '@/services/recording';

/**
 * PUT /api/recordings/[id]/segments/[segmentIndex]/parts/[partIndex]
 *
 * Upload one part: a raw byte range (~3MB) of the segment's MediaRecorder
 * stream. Idempotent by (segment, part) index so network retries are safe —
 * including after close, when a held part answers 2xx without a write.
 * Counts as a heartbeat. Deliberately NOT rate-limited beyond auth — a
 * healthy recorder uploads a part every ~90s plus 15s heartbeats, which
 * would trip the general limiter (see docs/LIVE_RECORDING_DESIGN.md §5).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; segmentIndex: string; partIndex: string }> }
) {
  const { id, segmentIndex: rawSegment, partIndex: rawPart } = await params;
  const { error, recording } = await requireRecordingOwner(id);
  if (error) return error;

  const tokenError = requireRecorderToken(request, recording);
  if (tokenError) return tokenError;

  if (recording.status !== 'recording' && recording.status !== 'paused') {
    return notCapturing();
  }

  const segmentIndex = Number(rawSegment);
  const partIndex = Number(rawPart);
  if (
    !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 9999 ||
    !Number.isInteger(partIndex) || partIndex < 0 || partIndex > 99999
  ) {
    return recordingError(400, 'invalid_request', 'Invalid segment or part index');
  }

  const segment = await getSegment(recording.id, segmentIndex);
  if (!segment) {
    return recordingError(404, 'segment_not_found', 'Segment not found');
  }
  if (segment.status !== 'open') {
    // A retry of a part the ledger already holds is still idempotent. Only a
    // part the closed segment does NOT hold gets segment_closed — the client
    // must never read that as an ACK (it would delete its only copy).
    const existing = await getPart(segment.id, partIndex);
    if (existing) return NextResponse.json({ received: existing.sizeBytes });
    return recordingError(409, 'segment_closed', 'Segment is closed');
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0) {
    return recordingError(400, 'empty_part', 'Empty part');
  }
  if (data.length > MAX_PART_BYTES) {
    return recordingError(413, 'part_too_large', 'Part exceeds maximum size');
  }
  if ((await recordingTotalBytes(recording.id)) + data.length > MAX_RECORDING_BYTES) {
    return recordingError(413, 'recording_too_large', 'Recording exceeds maximum total size');
  }

  try {
    await savePart(recording, segment, partIndex, data, recorderTokenFrom(request));
  } catch (err) {
    if (err instanceof CaptureRejectedError) return captureRejected(err);
    throw err;
  }
  return NextResponse.json({ received: data.length });
}
