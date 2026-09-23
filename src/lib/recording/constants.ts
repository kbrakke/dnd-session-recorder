/**
 * Recorder tunables (docs/LIVE_RECORDING_UI_SPEC.md, Step 2).
 *
 * Browser-safe: no DOM access. The NEXT_PUBLIC_* overrides exist for the
 * Playwright recording project (short chunks and parts so a 20s recording
 * exercises the upload path). Next inlines `process.env.NEXT_PUBLIC_…` at
 * compile time, so each is referenced literally below.
 */

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The one supported codec path (decision 4). */
export const RECORDING_MIME_TYPE = 'audio/webm;codecs=opus';
export const AUDIO_BITS_PER_SECOND = 48_000;

/** MediaRecorder timeslice: one IndexedDB chunk per slice. */
export const TIMESLICE_MS = positiveNumber(process.env.NEXT_PUBLIC_RECORDING_TIMESLICE_MS, 10_000);

/** A part seals at whichever limit comes first. Server cap is 8 MiB. */
export const PART_MAX_BYTES = 3 * 1024 * 1024;
export const PART_MAX_DURATION_MS = positiveNumber(
  process.env.NEXT_PUBLIC_RECORDING_PART_MAX_MS,
  90_000
);

/** Segment rotation: ~10 min at a silence, hard cap 15 min. */
export const ROTATION_TARGET_MS = positiveNumber(
  process.env.NEXT_PUBLIC_RECORDING_ROTATION_MS,
  600_000
);
export const ROTATION_HARD_CAP_MS =
  ROTATION_TARGET_MS === 600_000 ? 900_000 : Math.round(ROTATION_TARGET_MS * 1.5);

/** A pause this long closes the segment so everything captured is durable. */
export const PAUSE_CLOSES_SEGMENT_MS = 1_800_000;

/** Heartbeat cadence; the server derives 'interrupted' after 180s of silence. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TICK_MS = 5_000;

/** Level meter / silence detection. */
export const RMS_SAMPLE_MS = 100;
export const SILENCE_RMS = 0.01; // ≈ -40 dBFS
export const SILENCE_MIN_MS = 400;

export const FINALIZE_POLL_MS = 2_000;

/** Upload retry backoff (equal jitter). */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;
/** While offline, re-check at least this often even without an 'online' event. */
export const OFFLINE_FALLBACK_MS = 30_000;

/** Slack allowed on one media-clock delta beyond a timeslice (sleep guard). */
export const CLOCK_SLACK_MS = 2_000;

/** Fixed for Phase 1: a future schema is a NEW name, never a version bump. */
export const IDB_NAME = 'rpg-session-recorder';
export const IDB_VERSION = 1;
export const IDB_PROBE_NAME = 'rpg-session-recorder-probe';
export const IDB_TIMEOUT_MS = 5_000;

/** Bytes → seconds at the recording bitrate (display estimates only). */
export function bytesToSeconds(bytes: number): number {
  return Math.round((bytes * 8) / AUDIO_BITS_PER_SECOND);
}

/**
 * Capture constraints: echo cancellation and noise suppression are tuned
 * for calls and smear a multi-voice room; AGC helps distant players. Mono
 * is only a hint (`ideal`) — the server re-encodes if segments disagree.
 */
export const MEDIA_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
  channelCount: { ideal: 1 },
} as const;
