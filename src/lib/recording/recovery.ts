import { groupPending } from './idb-store';
import type { UploadQueue } from './upload-queue';
import type {
  ChunkMeta,
  RecordingDisplayStatus,
  RecordingSegmentState,
  UploadJob,
} from './types';

/**
 * Crash recovery, as pure decisions the engine executes.
 *
 * The drain uploads the un-ACKed IndexedDB tail with the token PERSISTED in
 * the local meta row — it never takes over just to drain. Taking over
 * rotates the token and forces status 'recording', which would kill a
 * recorder that is live on another device; a non-rotating drain is
 * non-destructive, and a 409 stale_token mid-drain is the positive signal
 * that a takeover really happened elsewhere.
 */

export type RecoveryDecision =
  /** Session already has audio: nothing to record or recover. */
  | { action: 'redirect-session' }
  /** No recording yet: show pre-flight. */
  | { action: 'fresh' }
  /** Assembly in progress: poll it. */
  | { action: 'finalizing' }
  /** Assembly done: hand off to the processing UI. */
  | { action: 'redirect-processing' }
  /** Assembly failed: Retry / Discard only (takeover is refused server-side). */
  | { action: 'failed'; strandLocal: boolean }
  /** Live in another tab/device (or this tab was reloaded): explicit Take over. */
  | { action: 'live-elsewhere' }
  /** Crash tail and/or interrupted: drain with the stored token, then choose. */
  | { action: 'drain' };

export function decideRecovery(input: {
  uploadId: string | null;
  recordingStatus: RecordingDisplayStatus | null;
  pendingCount: number;
  /** The live recorder's Web Lock is held by another tab in this browser. */
  lockHeld: boolean;
}): RecoveryDecision {
  if (input.uploadId) return { action: 'redirect-session' };
  switch (input.recordingStatus) {
    case null:
      return { action: 'fresh' };
    case 'finalizing':
      return { action: 'finalizing' };
    case 'finalized':
      return { action: 'redirect-processing' };
    case 'failed':
      return { action: 'failed', strandLocal: input.pendingCount > 0 };
    default:
      break;
  }
  // A second tab in the SAME browser shares IndexedDB: never drain rows the
  // live tab is still writing and uploading.
  if (input.lockHeld) return { action: 'live-elsewhere' };
  if (input.recordingStatus === 'interrupted' || input.pendingCount > 0) {
    return { action: 'drain' };
  }
  return { action: 'live-elsewhere' };
}

/**
 * Whether local rows can never be attached, given the server's view at drain
 * time: parts are only accepted while capturing, and takeover is refused
 * once the recording left the capture phase (or no longer exists).
 */
export function isStranded(serverStatus: RecordingDisplayStatus | 'not-found'): boolean {
  return (
    serverStatus === 'not-found' ||
    serverStatus === 'finalizing' ||
    serverStatus === 'finalized' ||
    serverStatus === 'failed'
  );
}

export interface DrainPlan {
  jobs: UploadJob[];
  /** Parts to upload (progress denominator). */
  totalParts: number;
  /** First segment index free for live capture after the drain. */
  nextSegmentIndex: number;
  /** Highest segment index held locally, or null when nothing is pending. */
  highestLocalSegment: number | null;
}

/**
 * Upload jobs that reconcile the local tail with the server ledger.
 *
 * - Opens EVERY index from the server's next segment through the highest
 *   local segment, ascending — including indexes with no local rows (an
 *   empty segment whose open never landed); otherwise the next open would
 *   409 segment_gap. Opens are idempotent server-side.
 * - Parts ascending within each segment.
 * - Close with partCount = max(server's max part + 1, local max part + 1):
 *   ACKed rows are gone locally, so the server ledger fills in the prefix.
 *   Never close with 0 (the server requires ≥1; finalize skips empty
 *   segments anyway).
 */
export function planDrain(
  pending: ChunkMeta[],
  server: { segments: RecordingSegmentState[] }
): DrainPlan {
  const grouped = groupPending(pending);
  // Server segment indexes are gapless, so the count is the next index.
  const serverNext = server.segments.length;
  const serverMax = new Map(server.segments.map(s => [s.index, s.maxPartIndex]));

  if (grouped.size === 0) {
    return { jobs: [], totalParts: 0, nextSegmentIndex: serverNext, highestLocalSegment: null };
  }

  const localSegments = [...grouped.keys()].sort((a, b) => a - b);
  const minLocal = localSegments[0];
  const maxLocal = localSegments[localSegments.length - 1];

  const jobs: UploadJob[] = [];
  let totalParts = 0;
  for (let s = Math.min(minLocal, serverNext); s <= maxLocal; s++) {
    if (s >= serverNext) jobs.push({ kind: 'open', segmentIndex: s });
    const parts = grouped.get(s);
    if (!parts) continue;

    let localMax = -1;
    for (const part of parts.values()) {
      jobs.push({ kind: 'part', ...part });
      localMax = Math.max(localMax, part.partIndex);
      totalParts++;
    }
    const serverMaxPart = serverMax.get(s);
    const partCount = Math.max(
      serverMaxPart === null || serverMaxPart === undefined ? 0 : serverMaxPart + 1,
      localMax + 1
    );
    if (partCount >= 1) jobs.push({ kind: 'close', segmentIndex: s, partCount });
  }

  return {
    jobs,
    totalParts,
    nextSegmentIndex: Math.max(serverNext, maxLocal + 1),
    highestLocalSegment: maxLocal,
  };
}

export type DrainOutcome =
  | { kind: 'done' }
  | { kind: 'failed'; error: Error };

/** Enqueue a plan on a queue built with the stored token and wait for it. */
export async function runDrain(queue: UploadQueue, plan: DrainPlan): Promise<DrainOutcome> {
  for (const job of plan.jobs) queue.enqueue(job);
  try {
    await queue.drained();
    return { kind: 'done' };
  } catch (error) {
    return { kind: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
