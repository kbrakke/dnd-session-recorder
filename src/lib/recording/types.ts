/**
 * Browser-safe types for the live recorder. Mirrors the server's JSON shapes
 * (dates arrive as ISO strings) — never import src/services/* from client
 * code: it pulls in Prisma and storage.
 */

export type RecordingDisplayStatus =
  | 'recording'
  | 'paused'
  | 'interrupted'
  | 'finalizing'
  | 'finalized'
  | 'failed';

/** `recording` field on GET /api/sessions and GET /api/sessions/[id]. */
export interface RecordingSummary {
  id: string;
  status: RecordingDisplayStatus;
  estimatedDurationSeconds: number;
  startedAt: string;
  lastHeartbeatAt: string;
  errorMessage: string | null;
}

export interface RecordingSegmentState {
  index: number;
  status: 'open' | 'closed';
  partCount: number;
  maxPartIndex: number | null;
  sizeBytes: number;
}

/** GET /api/recordings/[id] → { recording }. */
export interface RecordingState {
  id: string;
  sessionId: string;
  status: RecordingDisplayStatus;
  mimeType: string;
  startedAt: string;
  lastHeartbeatAt: string;
  totalBytes: number;
  estimatedDurationSeconds: number;
  segmentCount: number;
  partCount: number;
  segments: RecordingSegmentState[];
  finalizedUploadId: string | null;
  errorMessage: string | null;
}

/** POST /api/sessions/[id]/recording. */
export interface StartRecordingResponse {
  recording: RecordingState;
  recorderToken: string;
  nextSegmentIndex: number;
}

// ---------------------------------------------------------------------------
// Local buffer (IndexedDB)
// ---------------------------------------------------------------------------

/** One row per recording in this browser. */
export interface RecordingMeta {
  recordingId: string;
  sessionId: string;
  userId: string;
  /** Persisted so a crash drain can upload WITHOUT rotating the token. */
  recorderToken: string;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
}

/** One row per MediaRecorder timeslice blob; exists ⇔ not yet ACKed. */
export interface StoredChunk {
  recordingId: string;
  segmentIndex: number;
  /** Capture order within the segment, assigned synchronously. */
  seq: number;
  /** Stamped at write time: the part this chunk belongs to. */
  partIndex: number;
  blob: Blob;
  size: number;
  durationMs: number;
  /** Active-recording time at the end of this chunk (media clock). */
  mediaEndMs: number;
  capturedAt: number;
}

export type ChunkMeta = Omit<StoredChunk, 'blob'>;

/** A contiguous run of whole chunks uploaded as one part. */
export interface SealedPart {
  segmentIndex: number;
  partIndex: number;
  firstSeq: number;
  lastSeq: number;
  size: number;
  durationMs: number;
  mediaEndMs: number;
}

export type UploadJob =
  | { kind: 'open'; segmentIndex: number }
  | ({ kind: 'part' } & SealedPart)
  | { kind: 'close'; segmentIndex: number; partCount: number };

export type UploadHealth = 'ok' | 'degraded' | 'offline' | 'auth-expired';

// ---------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------

export type RecorderPhase =
  | 'idle'
  | 'unsupported'
  | 'preflight'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'uploading-tail'
  | 'finalizing'
  | 'finalized'
  | 'finalize-failed'
  | 'recovering'
  | 'recovery-choice'
  | 'discarding'
  | 'discarded'
  | 'taken-over'
  | 'error';

export type RecoveryMode = 'tail' | 'interrupted' | 'live-elsewhere' | 'failed';

export interface AudioInputDevice {
  deviceId: string;
  groupId: string;
  label: string;
}

/**
 * Immutable snapshot the React layer renders (useSyncExternalStore). The
 * engine replaces the whole object on every change and returns the same
 * reference between changes.
 */
export interface RecorderSnapshot {
  phase: RecorderPhase;
  sessionId: string;
  recordingId: string | null;
  segmentIndex: number;
  partIndex: number;
  /** Active recording time (pauses excluded). */
  elapsedMs: number;
  /** Media time covered by the last part ACKed in order. */
  savedThroughMs: number;
  pendingParts: number;
  uploadHealth: UploadHealth;
  lastUploadError: string | null;
  /** IndexedDB writes failing: audio uploads from memory only. */
  storageError: boolean;
  micLost: boolean;
  wakeLockActive: boolean;
  /** 0..1 input level, or null when unknown. */
  level: number | null;
  devices: AudioInputDevice[];
  selectedDeviceId: string | null;
  recovery: {
    mode: RecoveryMode;
    captured: RecordingState | null;
    drained: { done: number; total: number };
    /** Seconds of local audio that could not be attached. */
    strandedSeconds: number;
  } | null;
  finalize: {
    status: RecordingDisplayStatus | null;
    errorMessage: string | null;
    /** Assembly attempts so far (worker retries), when known. */
    attempts: number | null;
    /** Stop found no audio at all: only Discard makes sense. */
    nothingCaptured: boolean;
  };
  /** Uploading the tail has stalled long enough to offer finalizing without it. */
  abandonAvailable: boolean;
  errorMessage: string | null;
  takenOverMessage: string | null;
  /** The page navigates here (router.replace) when set. */
  redirectTo: string | null;
  /** bootstrap() has decided what to show (idle then means "fresh: pre-flight"). */
  bootstrapped: boolean;
}
