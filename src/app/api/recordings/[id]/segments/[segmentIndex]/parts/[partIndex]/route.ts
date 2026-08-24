import { NextResponse } from 'next/server';
import { requireRecorderToken, requireRecordingOwner } from '@/lib/route-utils';
import {
  MAX_PART_BYTES,
  MAX_RECORDING_BYTES,
  getSegment,
  recordingTotalBytes,
  savePart,
} from '@/services/recording';

/**
 * PUT /api/recordings/[id]/segments/[segmentIndex]/parts/[partIndex]
 *
 * Upload one part: a raw byte range (~3MB) of the segment's MediaRecorder
 * stream. Idempotent by (segment, part) index so network retries are safe.
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
    return NextResponse.json({ error: 'Recording is not capturing' }, { status: 409 });
  }

  const segmentIndex = Number(rawSegment);
  const partIndex = Number(rawPart);
  if (
    !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 9999 ||
    !Number.isInteger(partIndex) || partIndex < 0 || partIndex > 99999
  ) {
    return NextResponse.json({ error: 'Invalid segment or part index' }, { status: 400 });
  }

  const segment = await getSegment(recording.id, segmentIndex);
  if (!segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }
  if (segment.status !== 'open') {
    return NextResponse.json({ error: 'Segment is closed' }, { status: 409 });
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0) {
    return NextResponse.json({ error: 'Empty part' }, { status: 400 });
  }
  if (data.length > MAX_PART_BYTES) {
    return NextResponse.json({ error: 'Part exceeds maximum size' }, { status: 413 });
  }
  if ((await recordingTotalBytes(recording.id)) + data.length > MAX_RECORDING_BYTES) {
    return NextResponse.json({ error: 'Recording exceeds maximum total size' }, { status: 413 });
  }

  await savePart(recording, segment, partIndex, data);
  return NextResponse.json({ received: data.length });
}
