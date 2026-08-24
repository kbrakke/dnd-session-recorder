import { randomUUID } from 'crypto';
import type { Recording, RecordingSegment } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildRecordingPartKey, deleteObjectByKey, saveAudio } from '@/services/storage';
import { logger } from '@/lib/logger';

/**
 * Live recording lifecycle (docs/LIVE_RECORDING_DESIGN.md).
 *
 * The session's own status vocabulary is untouched: a session stays 'draft'
 * while its Recording row moves through recording -> paused -> finalizing ->
 * finalized (or failed). "Interrupted" is DERIVED (stale heartbeat), never
 * stored. Heartbeat timestamps are written with raw SQL NOW() — the
 * staleness comparison happens against the DB clock, and mixing clock
 * sources has burned this repo before (see src/services/CLAUDE.md).
 */

/** Heartbeats arrive every ~15s (60s+ from throttled background tabs). */
export const RECORDING_STALE_SECONDS = 180;

/** Per-part upload cap; the client targets ~3MB parts. */
export const MAX_PART_BYTES = 8 * 1024 * 1024;

/** Client records Opus at this bitrate; used only for duration estimates. */
export const RECORDING_BITS_PER_SECOND = 48_000;

/** Hard ceiling per recording (~6h at 48kbps, with slack): abuse guard. */
export const MAX_RECORDING_BYTES = 1024 * 1024 * 1024;

export type RecordingDisplayStatus =
  | 'recording'
  | 'paused'
  | 'interrupted'
  | 'finalizing'
  | 'finalized'
  | 'failed';

/** Strip codec parameters: 'audio/webm;codecs=opus' -> 'audio/webm'. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** File extension for the assembled recording, from the recorder's mime type. */
export function extensionForMime(mimeType: string): string {
  switch (baseMimeType(mimeType)) {
    case 'audio/webm':
      return '.webm';
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
    case 'audio/aac':
      return '.m4a';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/mpeg':
    case 'audio/mp3':
      return '.mp3';
    default:
      return '.webm';
  }
}

/** Rough captured duration from uploaded bytes (display only). */
export function estimateDurationSeconds(totalBytes: number): number {
  return Math.round((totalBytes * 8) / RECORDING_BITS_PER_SECOND);
}

/**
 * The status the UI should show. 'interrupted' is derived from a stale
 * heartbeat, so it needs no cron and can never go stale itself. `nowMs`
 * must come from the DB clock (SELECT NOW()), not the app server.
 */
export function deriveDisplayStatus(
  status: string,
  lastHeartbeatAt: Date,
  nowMs: number
): RecordingDisplayStatus {
  if (
    (status === 'recording' || status === 'paused') &&
    nowMs - lastHeartbeatAt.getTime() > RECORDING_STALE_SECONDS * 1000
  ) {
    return 'interrupted';
  }
  return status as RecordingDisplayStatus;
}

/**
 * The contiguous prefix of part indexes usable for assembly. Parts past a
 * gap (a lost upload) are unusable — everything before the gap is still
 * valid audio, which is what "finalize what we have" means.
 */
export function contiguousParts<T extends { index: number }>(parts: T[]): T[] {
  const sorted = [...parts].sort((a, b) => a.index - b.index);
  const prefix: T[] = [];
  for (const part of sorted) {
    if (part.index !== prefix.length) break;
    prefix.push(part);
  }
  return prefix;
}

export interface StartRecordingResult {
  recording: Recording;
  recorderToken: string;
  nextSegmentIndex: number;
}

/**
 * Start recording a session — or take it over. Starting and resuming are
 * the same operation: a fresh recorder token is issued, which invalidates
 * any other tab still holding the old one (its part uploads and heartbeats
 * get 409). Returns 'conflict' once the recording is past the capture phase.
 */
export async function startOrTakeoverRecording(
  sessionId: string,
  userId: string,
  mimeType: string
): Promise<StartRecordingResult | 'conflict'> {
  const recorderToken = randomUUID();

  const result = await prisma.$transaction(async tx => {
    const existing = await tx.recording.findUnique({
      where: { sessionId },
      include: { segments: { orderBy: { index: 'desc' }, take: 1 } },
    });

    if (existing) {
      if (!['recording', 'paused'].includes(existing.status)) {
        return 'conflict' as const;
      }
      const updated = await tx.recording.update({
        where: { id: existing.id },
        data: { recorderToken, status: 'recording', mimeType },
      });
      return {
        recording: updated,
        recorderToken,
        nextSegmentIndex: (existing.segments[0]?.index ?? -1) + 1,
      };
    }

    const created = await tx.recording.create({
      data: { sessionId, userId, status: 'recording', mimeType, recorderToken },
    });
    return { recording: created, recorderToken, nextSegmentIndex: 0 };
  });

  if (result === 'conflict') return result;

  // DB clock for the heartbeat baseline, per the clock rule.
  await touchHeartbeat(result.recording.id);
  return result;
}

/** Recording by id, masked to null unless owned by `userId` (404 pattern). */
export async function getOwnedRecording(
  recordingId: string,
  userId: string
): Promise<Recording | null> {
  const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
  if (!recording || recording.userId !== userId) return null;
  return recording;
}

/** Open segment `index`. Idempotent; enforces gapless segment indexes. */
export async function openSegment(
  recordingId: string,
  index: number
): Promise<RecordingSegment | 'gap'> {
  return prisma.$transaction(async tx => {
    const existing = await tx.recordingSegment.findUnique({
      where: { recordingId_index: { recordingId, index } },
    });
    if (existing) return existing; // retry after a lost response

    const last = await tx.recordingSegment.findFirst({
      where: { recordingId },
      orderBy: { index: 'desc' },
    });
    if (index !== (last?.index ?? -1) + 1) return 'gap';

    return tx.recordingSegment.create({
      data: { recordingId, index, status: 'open' },
    });
  });
}

/**
 * Persist one uploaded part: object first, then the ledger row (idempotent
 * by (segment, index) so retries are safe), then segment aggregates
 * recomputed from the ledger (so retries can't double-count). A part upload
 * is also an implicit heartbeat.
 */
export async function savePart(
  recording: Recording,
  segment: RecordingSegment,
  partIndex: number,
  data: Buffer
): Promise<void> {
  const storageKey = buildRecordingPartKey(
    recording.userId,
    recording.id,
    segment.index,
    partIndex
  );
  await saveAudio(storageKey, data, 'application/octet-stream');

  await prisma.$transaction(async tx => {
    await tx.recordingPart.upsert({
      where: { segmentId_index: { segmentId: segment.id, index: partIndex } },
      create: { segmentId: segment.id, index: partIndex, storageKey, sizeBytes: data.length },
      update: { storageKey, sizeBytes: data.length },
    });
    const totals = await tx.recordingPart.aggregate({
      where: { segmentId: segment.id },
      _count: true,
      _sum: { sizeBytes: true },
    });
    await tx.recordingSegment.update({
      where: { id: segment.id },
      data: { partCount: totals._count, sizeBytes: totals._sum.sizeBytes ?? 0 },
    });
  });

  await touchHeartbeat(recording.id);
}

/**
 * Declare a segment complete with its final part count. Returns the missing
 * part indexes if the ledger disagrees, so the client can re-upload from its
 * IndexedDB buffer instead of losing audio.
 */
export async function closeSegment(
  segment: RecordingSegment,
  declaredPartCount: number
): Promise<{ ok: true } | { ok: false; missing: number[] }> {
  const parts = await prisma.recordingPart.findMany({
    where: { segmentId: segment.id },
    select: { index: true },
  });
  const have = new Set(parts.map(p => p.index));
  const missing: number[] = [];
  for (let i = 0; i < declaredPartCount; i++) {
    if (!have.has(i)) missing.push(i);
  }
  if (missing.length > 0) return { ok: false, missing };

  await prisma.recordingSegment.update({
    where: { id: segment.id },
    data: { status: 'closed', partCount: declaredPartCount },
  });
  return { ok: true };
}

/** Segment lookup by (recording, index). */
export async function getSegment(
  recordingId: string,
  index: number
): Promise<RecordingSegment | null> {
  return prisma.recordingSegment.findUnique({
    where: { recordingId_index: { recordingId, index } },
  });
}

/** Total uploaded bytes across all of a recording's parts. */
export async function recordingTotalBytes(recordingId: string): Promise<number> {
  const totals = await prisma.recordingPart.aggregate({
    where: { segment: { recordingId } },
    _sum: { sizeBytes: true },
  });
  return totals._sum.sizeBytes ?? 0;
}

/** Heartbeat: DB-clock timestamp + the client's current state. */
export async function heartbeatRecording(
  recordingId: string,
  state: 'recording' | 'paused'
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE recordings
    SET last_heartbeat_at = NOW(), status = ${state}, updated_at = NOW()
    WHERE id = ${recordingId} AND status IN ('recording', 'paused')
  `;
}

async function touchHeartbeat(recordingId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE recordings SET last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = ${recordingId}
  `;
}

export interface RecordingState {
  id: string;
  sessionId: string;
  status: RecordingDisplayStatus;
  mimeType: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
  totalBytes: number;
  estimatedDurationSeconds: number;
  segmentCount: number;
  finalizedUploadId: string | null;
  errorMessage: string | null;
}

/** Full state for the HUD / recovery card, with DB-clock-derived status. */
export async function getRecordingState(recording: Recording): Promise<RecordingState> {
  const [totals, segmentCount, nowRows] = await Promise.all([
    prisma.recordingPart.aggregate({
      where: { segment: { recordingId: recording.id } },
      _sum: { sizeBytes: true },
    }),
    prisma.recordingSegment.count({ where: { recordingId: recording.id } }),
    prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`,
  ]);

  const totalBytes = totals._sum.sizeBytes ?? 0;
  return {
    id: recording.id,
    sessionId: recording.sessionId,
    status: deriveDisplayStatus(
      recording.status,
      recording.lastHeartbeatAt,
      nowRows[0].now.getTime()
    ),
    mimeType: recording.mimeType,
    startedAt: recording.startedAt,
    lastHeartbeatAt: recording.lastHeartbeatAt,
    totalBytes,
    estimatedDurationSeconds: estimateDurationSeconds(totalBytes),
    segmentCount,
    finalizedUploadId: recording.finalizedUploadId,
    errorMessage: recording.errorMessage,
  };
}

/**
 * Move to 'finalizing' and report whether there is anything to assemble.
 * 'conflict' when finalization already ran (or is running); 'empty' when no
 * parts ever landed.
 */
export async function beginFinalize(
  recording: Recording
): Promise<'ok' | 'conflict' | 'empty'> {
  if (!['recording', 'paused', 'failed'].includes(recording.status)) {
    return 'conflict';
  }
  const partCount = await prisma.recordingPart.count({
    where: { segment: { recordingId: recording.id } },
  });
  if (partCount === 0) return 'empty';

  await prisma.recording.update({
    where: { id: recording.id },
    data: { status: 'finalizing', errorMessage: null },
  });
  return 'ok';
}

/** Terminal finalize failure: parts are retained and the card offers retry. */
export async function markRecordingFailed(sessionId: string, message: string): Promise<void> {
  await prisma.recording.updateMany({
    where: { sessionId, status: 'finalizing' },
    data: { status: 'failed', errorMessage: message },
  });
}

/**
 * Discard a recording: delete part objects (best-effort — orphans only cost
 * pennies and a retryable DELETE), then the rows. Deleting the row is what
 * frees the session to be recorded again.
 */
export async function discardRecording(recording: Recording): Promise<void> {
  const parts = await prisma.recordingPart.findMany({
    where: { segment: { recordingId: recording.id } },
    select: { storageKey: true },
  });

  const results = await Promise.allSettled(parts.map(p => deleteObjectByKey(p.storageKey)));
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    logger.warn('Some recording part objects could not be deleted', {
      recordingId: recording.id,
      failed,
      total: parts.length,
    });
  }

  await prisma.recording.delete({ where: { id: recording.id } });
  logger.info('Recording discarded', { recordingId: recording.id, parts: parts.length });
}
