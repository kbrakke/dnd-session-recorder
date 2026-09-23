import { randomUUID } from 'crypto';
import type { Prisma, Recording, RecordingSegment } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildRecordingPartKey, deleteObjectByKey, saveAudio } from '@/services/storage';
import { getLatestJob } from '@/services/pipeline/queue';
import { logger } from '@/lib/logger';

/**
 * Live recording lifecycle (docs/LIVE_RECORDING_DESIGN.md,
 * docs/LIVE_RECORDING_UI_SPEC.md).
 *
 * The session's own status vocabulary is untouched: a session stays 'draft'
 * while its Recording row moves through recording -> paused -> finalizing ->
 * finalized (or failed). "Interrupted" is DERIVED (stale heartbeat), never
 * stored. Heartbeat timestamps are written with raw SQL NOW() — the
 * staleness comparison happens against the DB clock, and mixing clock
 * sources has burned this repo before (see src/services/CLAUDE.md).
 *
 * Concurrency: route-level token/status checks are only a fast path. Every
 * capture write re-verifies the recorder token and capture status INSIDE its
 * own transaction (assertCapturing), and takeover/finalize are conditional
 * writes, so a takeover or finalize that commits between a route's check and
 * its write can never be overwritten.
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

/**
 * A capture write lost a race: the recorder token no longer matches (another
 * tab took over) or the recording left the capture phase. Routes map it to a
 * 409 with code 'stale_token' / 'not_capturing'.
 */
export class CaptureRejectedError extends Error {
  constructor(public readonly reason: 'stale_token' | 'not_capturing') {
    super(
      reason === 'stale_token'
        ? 'Recording was taken over in another tab'
        : 'Recording is not capturing'
    );
    this.name = 'CaptureRejectedError';
  }
}

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

/** Current DB-clock time in ms (the clock 'interrupted' is derived against). */
export async function dbNowMs(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
  return rows[0].now.getTime();
}

// ---------------------------------------------------------------------------
// Lightweight summary for session reads (list + detail)
// ---------------------------------------------------------------------------

export interface RecordingSummary {
  id: string;
  status: RecordingDisplayStatus;
  estimatedDurationSeconds: number;
  startedAt: Date;
  lastHeartbeatAt: Date;
  errorMessage: string | null;
}

/**
 * Prisma select fragment for the recording relation on session reads.
 * NEVER selects recorderToken. Segment sizes (kept equal to the sum of their
 * parts by savePart, and surviving finalize) give the duration estimate
 * without touching recording_parts.
 */
export const recordingSummarySelect = {
  select: {
    id: true,
    status: true,
    startedAt: true,
    lastHeartbeatAt: true,
    errorMessage: true,
    segments: { select: { sizeBytes: true } },
  },
} satisfies Prisma.GamingSession$recordingArgs;

export type RecordingSummaryRow = {
  id: string;
  status: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
  errorMessage: string | null;
  segments: { sizeBytes: number }[];
};

/** Summary with DB-clock-derived status. One `nowMs` per request, not per row. */
export function summarizeRecording(row: RecordingSummaryRow, nowMs: number): RecordingSummary {
  const totalBytes = row.segments.reduce((sum, s) => sum + s.sizeBytes, 0);
  return {
    id: row.id,
    status: deriveDisplayStatus(row.status, row.lastHeartbeatAt, nowMs),
    estimatedDurationSeconds: estimateDurationSeconds(totalBytes),
    startedAt: row.startedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    errorMessage: row.errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Re-verify, inside the caller's transaction, that `token` is the current
 * recorder token and the recording is capturing — and refresh the heartbeat
 * (DB clock). The UPDATE takes the row lock, so a concurrent takeover or
 * finalize either commits first (and this rejects) or waits for us.
 */
async function assertCapturing(
  tx: Prisma.TransactionClient,
  recordingId: string,
  token: string | null
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE recordings SET last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = ${recordingId}
      AND recorder_token = ${token ?? ''}
      AND status IN ('recording', 'paused')
    RETURNING id
  `;
  if (rows.length > 0) return;

  const current = await tx.recording.findUnique({
    where: { id: recordingId },
    select: { recorderToken: true, status: true },
  });
  if (current && current.recorderToken !== token) {
    throw new CaptureRejectedError('stale_token');
  }
  throw new CaptureRejectedError('not_capturing');
}

export type StartRecordingOutcome =
  | { kind: 'ok'; recording: Recording; recorderToken: string; nextSegmentIndex: number }
  | { kind: 'past_capture' }
  | { kind: 'still_capturing'; lastHeartbeatAt: Date };

/**
 * Start recording a session — or take it over. Starting and resuming are
 * the same operation: a fresh recorder token is issued, which invalidates
 * any other tab still holding the old one (its writes get 409).
 *
 * A LIVE recording (fresh heartbeat) is only taken over with `force` — the
 * UI asks the user first, because takeover stops capture in the other tab.
 */
export async function startOrTakeoverRecording(
  sessionId: string,
  userId: string,
  mimeType: string,
  options: { force?: boolean } = {}
): Promise<StartRecordingOutcome> {
  const recorderToken = randomUUID();

  const result = await prisma.$transaction(async (tx): Promise<StartRecordingOutcome> => {
    // Lock the parent session row: serializes takeover vs finalize vs a
    // concurrent first start (which would otherwise race into a unique
    // violation on recordings.session_id). A missing row can't be locked,
    // so the session row is the only lock that covers the create path.
    await tx.$queryRaw`SELECT id FROM gaming_sessions WHERE id = ${sessionId} FOR UPDATE`;

    const existing = await tx.recording.findUnique({ where: { sessionId } });

    if (!existing) {
      const created = await tx.recording.create({
        data: { sessionId, userId, status: 'recording', mimeType, recorderToken },
      });
      return { kind: 'ok', recording: created, recorderToken, nextSegmentIndex: 0 };
    }

    if (!['recording', 'paused'].includes(existing.status)) {
      return { kind: 'past_capture' };
    }

    if (!options.force) {
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
      const display = deriveDisplayStatus(
        existing.status,
        existing.lastHeartbeatAt,
        nowRows[0].now.getTime()
      );
      if (display !== 'interrupted') {
        return { kind: 'still_capturing', lastHeartbeatAt: existing.lastHeartbeatAt };
      }
    }

    // Rotate the token FIRST (row lock), then read segments: an old tab's
    // openSegment either committed before this write (and is counted) or is
    // rejected by assertCapturing afterwards.
    const updated = await tx.recording.update({
      where: { id: existing.id },
      data: { recorderToken, status: 'recording', mimeType },
    });
    const last = await tx.recordingSegment.findFirst({
      where: { recordingId: existing.id },
      orderBy: { index: 'desc' },
    });
    return {
      kind: 'ok',
      recording: updated,
      recorderToken,
      nextSegmentIndex: (last?.index ?? -1) + 1,
    };
  });

  if (result.kind === 'ok') {
    // DB clock for the heartbeat baseline, per the clock rule.
    await touchHeartbeat(result.recording.id);
  }
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

/**
 * Open segment `index`. Idempotent; enforces gapless segment indexes.
 * Throws CaptureRejectedError when the token/status lost a race.
 */
export async function openSegment(
  recordingId: string,
  index: number,
  token: string | null
): Promise<RecordingSegment | 'gap'> {
  return prisma.$transaction(async tx => {
    await assertCapturing(tx, recordingId, token);

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
 * Persist one uploaded part: object first, then — inside one transaction that
 * re-verifies the token/status — the ledger row (idempotent by
 * (segment, index)) and the segment aggregates recomputed from the ledger.
 * The verification doubles as the heartbeat. A rejected write best-effort
 * deletes the object it just stored; the client keeps its local copy because
 * it saw a 409, not a 200.
 */
export async function savePart(
  recording: Recording,
  segment: RecordingSegment,
  partIndex: number,
  data: Buffer,
  token: string | null
): Promise<void> {
  const storageKey = buildRecordingPartKey(
    recording.userId,
    recording.id,
    segment.index,
    partIndex
  );
  await saveAudio(storageKey, data, 'application/octet-stream');

  try {
    await prisma.$transaction(async tx => {
      await assertCapturing(tx, recording.id, token);
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
  } catch (error) {
    if (error instanceof CaptureRejectedError) {
      // Only delete when no ledger row points at this key (a retried part
      // that already landed keeps its object).
      const ledger = await prisma.recordingPart.findUnique({
        where: { segmentId_index: { segmentId: segment.id, index: partIndex } },
        select: { id: true },
      });
      if (!ledger) {
        await deleteObjectByKey(storageKey).catch(err =>
          logger.warn('Could not delete rejected recording part object', {
            recordingId: recording.id,
            storageKey,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }
    throw error;
  }
}

/**
 * Declare a segment complete with its final part count. Returns the missing
 * part indexes if the ledger disagrees, so the client can re-upload them from
 * its IndexedDB buffer instead of losing audio.
 */
export async function closeSegment(
  segment: RecordingSegment,
  declaredPartCount: number,
  token: string | null
): Promise<{ ok: true } | { ok: false; missing: number[] }> {
  return prisma.$transaction(async tx => {
    await assertCapturing(tx, segment.recordingId, token);

    const parts = await tx.recordingPart.findMany({
      where: { segmentId: segment.id },
      select: { index: true },
    });
    const have = new Set(parts.map(p => p.index));
    const missing: number[] = [];
    for (let i = 0; i < declaredPartCount; i++) {
      if (!have.has(i)) missing.push(i);
    }
    if (missing.length > 0) return { ok: false as const, missing };

    await tx.recordingSegment.update({
      where: { id: segment.id },
      data: { status: 'closed', partCount: declaredPartCount },
    });
    return { ok: true as const };
  });
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

/**
 * Heartbeat: DB-clock timestamp + the client's current state. Conditional on
 * the current token and a capturing status, so a stale tab (or a heartbeat
 * that raced a takeover/finalize) can never overwrite state.
 */
export async function heartbeatRecording(
  recordingId: string,
  state: 'recording' | 'paused',
  token: string | null
): Promise<void> {
  const updated = await prisma.$executeRaw`
    UPDATE recordings
    SET last_heartbeat_at = NOW(), status = ${state}, updated_at = NOW()
    WHERE id = ${recordingId}
      AND recorder_token = ${token ?? ''}
      AND status IN ('recording', 'paused')
  `;
  if (updated > 0) return;

  const current = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { recorderToken: true },
  });
  throw new CaptureRejectedError(
    current && current.recorderToken !== token ? 'stale_token' : 'not_capturing'
  );
}

async function touchHeartbeat(recordingId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE recordings SET last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = ${recordingId}
  `;
}

// ---------------------------------------------------------------------------
// State for the recorder page / recovery card
// ---------------------------------------------------------------------------

export interface RecordingSegmentState {
  index: number;
  status: 'open' | 'closed';
  /** Parts actually in the ledger (not the stored column, which a gap skews). */
  partCount: number;
  /** Highest uploaded part index, or null when the segment has no parts. */
  maxPartIndex: number | null;
  sizeBytes: number;
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
  /** Total part rows across segments (0 after finalize: parts are deleted). */
  partCount: number;
  /** Per-segment ledger — the crash drain reconciles its local tail with it. */
  segments: RecordingSegmentState[];
  finalizedUploadId: string | null;
  errorMessage: string | null;
}

/** Full state for the HUD / recovery card, with DB-clock-derived status. */
export async function getRecordingState(recording: Recording): Promise<RecordingState> {
  const [segments, nowMs] = await Promise.all([
    prisma.recordingSegment.findMany({
      where: { recordingId: recording.id },
      orderBy: { index: 'asc' },
      include: { parts: { select: { index: true, sizeBytes: true } } },
    }),
    dbNowMs(),
  ]);

  const segmentStates: RecordingSegmentState[] = segments.map(segment => ({
    index: segment.index,
    status: segment.status === 'closed' ? 'closed' : 'open',
    partCount: segment.parts.length,
    maxPartIndex:
      segment.parts.length > 0 ? Math.max(...segment.parts.map(p => p.index)) : null,
    sizeBytes: segment.parts.reduce((sum, p) => sum + p.sizeBytes, 0),
  }));
  const totalBytes = segmentStates.reduce((sum, s) => sum + s.sizeBytes, 0);
  const partCount = segmentStates.reduce((sum, s) => sum + s.partCount, 0);

  return {
    id: recording.id,
    sessionId: recording.sessionId,
    status: deriveDisplayStatus(recording.status, recording.lastHeartbeatAt, nowMs),
    mimeType: recording.mimeType,
    startedAt: recording.startedAt,
    lastHeartbeatAt: recording.lastHeartbeatAt,
    totalBytes,
    estimatedDurationSeconds: estimateDurationSeconds(totalBytes),
    segmentCount: segments.length,
    partCount,
    segments: segmentStates,
    finalizedUploadId: recording.finalizedUploadId,
    errorMessage: recording.errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Finalize / fail / discard
// ---------------------------------------------------------------------------

export type BeginFinalizeOutcome =
  | 'ok'
  | 'conflict'
  | 'empty'
  | { kind: 'still_capturing'; lastHeartbeatAt: Date };

/**
 * Move to 'finalizing' and report whether there is anything to assemble.
 *
 * The transition is ONE conditional UPDATE against the DB clock, so it can't
 * race a takeover or a heartbeat. A LIVE recording (fresh heartbeat) is only
 * finalized by the capturing tab (matching `recorderToken`) or with `force` —
 * otherwise a recovery card in another tab would strand audio the live tab is
 * still capturing. 'failed' is always retryable. A recording stuck in
 * 'finalizing' with no active job (worker died, job cancelled) is re-enqueued
 * instead of being a dead end.
 */
export async function beginFinalize(
  recording: Recording,
  options: { recorderToken?: string | null; force?: boolean } = {}
): Promise<BeginFinalizeOutcome> {
  if (recording.status === 'finalizing') {
    const job = await getLatestJob(recording.sessionId);
    const active = job && (job.status === 'pending' || job.status === 'running');
    return active ? 'conflict' : 'ok';
  }
  if (!['recording', 'paused', 'failed'].includes(recording.status)) {
    return 'conflict';
  }

  const partCount = await prisma.recordingPart.count({
    where: { segment: { recordingId: recording.id } },
  });
  if (partCount === 0) return 'empty';

  const force = !!options.force;
  const token = options.recorderToken ?? '';
  const updated = await prisma.$executeRaw`
    UPDATE recordings
    SET status = 'finalizing', error_message = NULL, updated_at = NOW()
    WHERE id = ${recording.id}
      AND (
        status = 'failed'
        OR (
          status IN ('recording', 'paused')
          AND (
            ${force}
            OR recorder_token = ${token}
            OR last_heartbeat_at < NOW() - (${RECORDING_STALE_SECONDS}::int * INTERVAL '1 second')
          )
        )
      )
  `;
  if (updated > 0) return 'ok';

  const current = await prisma.recording.findUnique({ where: { id: recording.id } });
  if (current && (current.status === 'recording' || current.status === 'paused')) {
    return { kind: 'still_capturing', lastHeartbeatAt: current.lastHeartbeatAt };
  }
  return 'conflict';
}

/** Undo a beginFinalize when no finalize job could be enqueued. */
export async function revertFinalize(recordingId: string, previousStatus: string): Promise<void> {
  await prisma.recording.updateMany({
    where: { id: recordingId, status: 'finalizing' },
    data: { status: previousStatus },
  });
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

  await prisma.recording.deleteMany({ where: { id: recording.id } });
  logger.info('Recording discarded', { recordingId: recording.id, parts: parts.length });
}
