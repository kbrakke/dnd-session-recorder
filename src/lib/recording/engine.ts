import {
  FINALIZE_POLL_MS,
  HEARTBEAT_TICK_MS,
  PART_MAX_BYTES,
  PAUSE_CLOSES_SEGMENT_MS,
  RECORDING_MIME_TYPE,
  RMS_SAMPLE_MS,
  TIMESLICE_MS,
  bytesToSeconds,
} from './constants';
import { createRecorderApi, isRecorderApiError } from './api';
import type { RecorderApi, RecorderErrorKind } from './api';
import {
  acquireMicStream,
  createLevelMeter,
  createSegmentRun,
  listAudioInputs,
  toMicError,
} from './capture';
import type {
  AudioContextCtor,
  LevelMeter,
  MediaDevicesLike,
  MediaRecorderCtor,
  SegmentRun,
  StopReason,
} from './capture';
import { Heartbeat } from './heartbeat';
import { openRecorderStore } from './idb-store';
import type { RecorderStore } from './idb-store';
import { MediaClock } from './media-clock';
import { PartAssembler } from './part-assembler';
import { decideRecovery, isStranded, planDrain, runDrain } from './recovery';
import { SilenceDetector, shouldCloseForPause, shouldRotate } from './rotation';
import { CAPTURING_PHASES, TERMINAL_PHASES, transition } from './state-machine';
import type { RecorderEvent } from './state-machine';
import { UploadQueue, browserQueueTiming } from './upload-queue';
import type { PartSource, QueueDeps, QueueEvents } from './upload-queue';
import type {
  ChunkMeta,
  RecorderSnapshot,
  RecordingDisplayStatus,
  RecordingState,
  RecoveryMode,
  SealedPart,
  StoredChunk,
} from './types';

/**
 * The live recorder: one per session per JS context (see engine-registry).
 *
 * Lives OUTSIDE React. Owns the stream, meter, MediaRecorder runs, local
 * buffer, upload queue, heartbeat, wake lock and Web Lock; the UI renders
 * `getSnapshot()` via useSyncExternalStore and calls commands from click
 * handlers. Every command is phase-guarded, so double clicks and React
 * StrictMode double effects are harmless. The engine is only disposed by a
 * terminal outcome or registry eviction — never by a React unmount, which
 * is what lets capture survive in-app navigation.
 *
 * Invariants (docs/LIVE_RECORDING_UI_SPEC.md):
 * - A segment is exactly one MediaRecorder run; handlers are closure-bound
 *   to their segment, so a late final blob never lands on the next one.
 * - Chunk seq + part assignment happen synchronously in `onChunk`; the IDB
 *   put is issued synchronously; a sealed part is queued only after all of
 *   its chunks are durable (or held in memory if storage failed).
 * - Segment opens are queued eagerly and in order; empty segments are never
 *   closed.
 * - Local rows are deleted only after the server ACKs a part.
 */

export interface WakeLockLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface LocksLike {
  request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: unknown) => unknown
  ): Promise<unknown>;
}

export interface EngineDeps {
  api: RecorderApi;
  openStore(): Promise<RecorderStore>;
  mediaDevices: MediaDevicesLike | null;
  MediaRecorder: MediaRecorderCtor | null;
  AudioContext: AudioContextCtor | null;
  /** Monotonic ms (performance.now). */
  now(): number;
  /** Wall clock ms (Date.now) — only for stored timestamps. */
  wallNow(): number;
  random(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  isOnline(): boolean;
  waitOnline(signal: AbortSignal): Promise<void>;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  locks: LocksLike | null;
  requestWakeLock(): Promise<WakeLockLike | null>;
  persistStorage(): void;
  onVisibilityChange(listener: (hidden: boolean) => void): () => void;
  onDeviceChange(listener: () => void): () => void;
  log(message: string, extra?: Record<string, unknown>): void;
}

/** Browser implementations, resolved lazily (never at import time). */
export function browserEngineDeps(): EngineDeps {
  const timing = browserQueueTiming();
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  return {
    api: createRecorderApi(),
    openStore: () => openRecorderStore(),
    mediaDevices: nav?.mediaDevices ?? null,
    MediaRecorder: (win?.MediaRecorder as unknown as MediaRecorderCtor | undefined) ?? null,
    AudioContext: (win?.AudioContext as unknown as AudioContextCtor | undefined) ?? null,
    now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
    wallNow: () => Date.now(),
    random: timing.random,
    sleep: timing.sleep,
    isOnline: timing.isOnline,
    waitOnline: timing.waitOnline,
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    locks: (nav && 'locks' in nav ? (nav.locks as unknown as LocksLike) : null) ?? null,
    async requestWakeLock() {
      // lib.dom types wakeLock as always present; it isn't (older Firefox).
      if (!nav || !('wakeLock' in nav) || !nav.wakeLock) return null;
      try {
        return (await nav.wakeLock.request('screen')) as unknown as WakeLockLike;
      } catch {
        return null;
      }
    },
    persistStorage() {
      void nav?.storage?.persist?.().catch(() => undefined);
    },
    onVisibilityChange(listener) {
      if (typeof document === 'undefined') return () => undefined;
      const handler = () => listener(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    onDeviceChange(listener) {
      const md = nav?.mediaDevices;
      if (!md?.addEventListener) return () => undefined;
      md.addEventListener('devicechange', listener);
      return () => md.removeEventListener('devicechange', listener);
    },
    log(message, extra) {
      console.warn(`[recorder] ${message}`, extra ?? '');
    },
  };
}

export function initialSnapshot(sessionId: string): RecorderSnapshot {
  return Object.freeze({
    phase: 'idle',
    sessionId,
    recordingId: null,
    segmentIndex: 0,
    partIndex: 0,
    elapsedMs: 0,
    savedThroughMs: 0,
    pendingParts: 0,
    uploadHealth: 'ok',
    lastUploadError: null,
    storageError: false,
    micLost: false,
    wakeLockActive: false,
    level: null,
    devices: [],
    selectedDeviceId: null,
    recovery: null,
    finalize: { status: null, errorMessage: null, attempts: null, nothingCaptured: false },
    abandonAvailable: false,
    unresolved: null,
    errorMessage: null,
    takenOverMessage: null,
    redirectTo: null,
    bootstrapped: false,
  }) as RecorderSnapshot;
}

/** Stalled tail uploads offer "finalize without the tail" after this long. */
const ABANDON_AFTER_MS = 60_000;
/** Grace for the worker to enqueue processing before handing off. */
const HANDOFF_GRACE_MS = 5_000;
/** Local metas older than this are garbage-collected. */
const META_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Upper bound on waiting for outstanding recorder stops at Stop. */
const STOP_JOIN_TIMEOUT_MS = 15_000;

const lockName = (recordingId: string) => `rpg-recorder:${recordingId}`;

/** Byte-range slices of at most `max` bytes (order preserved, no copy). */
export function splitBlob(blob: Blob, max: number): Blob[] {
  if (blob.size <= max) return [blob];
  const slices: Blob[] = [];
  for (let offset = 0; offset < blob.size; offset += max) {
    slices.push(blob.slice(offset, Math.min(offset + max, blob.size), blob.type));
  }
  return slices;
}

export interface StartOptions {
  /** A live microphone stream handed over from pre-flight. */
  stream: MediaStream;
  userId: string;
  deviceId?: string | null;
  /** Omit on Resume: the engine uses the recording and token from takeover. */
  recordingId?: string;
  recorderToken?: string;
  nextSegmentIndex?: number;
  mimeType?: string;
}

export class RecorderEngine {
  private snap: RecorderSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly deps: EngineDeps;

  // identity
  private userId = '';
  private recordingId: string | null = null;
  private token: string | null = null;
  private mimeType = RECORDING_MIME_TYPE;
  private nextSegmentIndex = 0;
  private takeoverForce = false;
  private tookOver = false;

  // capture
  private stream: MediaStream | null = null;
  private meter: LevelMeter | null = null;
  private run: SegmentRun | null = null;
  private segmentStartedAt = 0;
  private readonly assembler = new PartAssembler();
  private readonly clock: MediaClock;
  private readonly silence = new SilenceDetector();
  private readonly lastMediaEnd = new Map<number, number>();
  private flushOnNextBlob = false;
  /** Highest media time of any acknowledged part (see savedThrough()). */
  private ackedThroughMs = 0;
  private stopRequested = false;
  /** Bumped by stop/halt/dispose: async work started earlier must not resurrect capture. */
  private captureGen = 0;
  /** Outstanding run stops (rotation, mic loss, long pause): joined before finalize. */
  private readonly pendingStops = new Set<Promise<void>>();
  private pausedAt = 0;
  private trackEndedCleanup: (() => void) | null = null;

  // durability
  private store: RecorderStore | null = null;
  private storePromise: Promise<RecorderStore | null> | null = null;
  /** Chunks whose IDB write failed: uploaded from memory. Key `${s}/${p}`. */
  private readonly memory = new Map<string, StoredChunk[]>();
  private writeChain: Promise<void> = Promise.resolve();
  private queue: UploadQueue | null = null;
  private heartbeat: Heartbeat | null = null;
  private abandoning = false;

  // environment
  private timers: unknown[] = [];
  private intervals: unknown[] = [];
  private pauseTimer: unknown = null;
  private abandonTimer: unknown = null;
  private cleanups: Array<() => void> = [];
  private wakeLock: WakeLockLike | null = null;
  private releaseLock: (() => void) | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private disposed = false;
  private rmsTicks = 0;

  constructor(readonly sessionId: string, deps?: Partial<EngineDeps>) {
    this.deps = { ...browserEngineDeps(), ...deps } as EngineDeps;
    this.snap = initialSnapshot(sessionId);
    this.clock = new MediaClock(() => this.deps.now());
  }

  // -------------------------------------------------------------------------
  // External store
  // -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RecorderSnapshot => this.snap;

  /** The current recorder token (for the page's Stop-less flows). */
  get currentToken(): string | null {
    return this.token;
  }

  private set(patch: Partial<RecorderSnapshot>): void {
    this.snap = Object.freeze({ ...this.snap, ...patch }) as RecorderSnapshot;
    this.listeners.forEach(listener => listener());
  }

  private dispatch(event: RecorderEvent, patch: Partial<RecorderSnapshot> = {}): boolean {
    const next = transition(this.snap.phase, event);
    if (next === null) {
      this.deps.log('ignored invalid transition', { phase: this.snap.phase, event: event.type });
      return false;
    }
    this.set({ ...patch, phase: next });
    return true;
  }

  private isCapturing(): boolean {
    return CAPTURING_PHASES.includes(this.snap.phase);
  }

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------

  /**
   * Begin capturing with a stream from pre-flight. Call ONLY from a click
   * handler. Fresh start: pass the ids from POST /recording. Resume: the
   * engine takes over first (one POST per gesture) then starts.
   */
  async start(opts: StartOptions): Promise<void> {
    if (this.snap.phase !== 'idle' && this.snap.phase !== 'preflight') return;
    if (!this.deps.MediaRecorder) {
      this.dispatch({ type: 'FATAL' }, { errorMessage: 'This browser cannot record audio.' });
      return;
    }
    this.userId = opts.userId;
    if (opts.mimeType) this.mimeType = opts.mimeType;

    if (!this.dispatch({ type: 'START' })) return;

    if (opts.recordingId && opts.recorderToken) {
      this.recordingId = opts.recordingId;
      this.token = opts.recorderToken;
      this.nextSegmentIndex = Math.max(this.nextSegmentIndex, opts.nextSegmentIndex ?? 0);
    } else if (!this.tookOver) {
      try {
        await this.takeover();
      } catch (error) {
        this.stopTracks(opts.stream);
        this.failStart(error);
        return;
      }
    }
    if (!this.recordingId || !this.token) {
      this.stopTracks(opts.stream);
      this.dispatch({ type: 'FATAL' }, { errorMessage: 'Recording could not be started.' });
      return;
    }

    this.stopRequested = false;
    this.abandoning = false;
    this.attachStream(opts.stream, opts.deviceId ?? null);

    const store = await this.ensureStore();
    if (store) {
      await store
        .putMeta({
          recordingId: this.recordingId,
          sessionId: this.sessionId,
          userId: this.userId,
          recorderToken: this.token,
          mimeType: this.mimeType,
          createdAt: this.deps.wallNow(),
          updatedAt: this.deps.wallNow(),
        })
        .catch(() => this.set({ storageError: true }));
    }
    this.deps.persistStorage();

    this.queue = this.createQueue(this.token, this.liveQueueEvents());
    this.heartbeat = new Heartbeat(
      this.recordingId,
      this.token,
      {
        transport: this.deps.api.transport,
        now: () => this.deps.wallNow(),
        setInterval: (fn, ms) => this.deps.setInterval(fn, ms),
        clearInterval: handle => this.deps.clearInterval(handle),
      },
      {
        onFatal: kind => this.onFatalFromServer(kind),
        onAuthError: message => this.set({ uploadHealth: 'auth-expired', lastUploadError: message }),
      }
    );

    this.holdLock();
    void this.acquireWakeLock();
    this.installListeners();

    this.startSegment(this.nextSegmentIndex);
    this.heartbeat.start(() => (this.snap.phase === 'paused' || this.snap.micLost ? 'paused' : 'recording'));
    this.startSampling();

    this.dispatch({ type: 'STARTED' }, {
      recordingId: this.recordingId,
      recovery: null,
      errorMessage: null,
      finalize: { status: null, errorMessage: null, attempts: null, nothingCaptured: false },
    });
    void this.refreshDevices();
  }

  private failStart(error: unknown): void {
    const message = isRecorderApiError(error)
      ? error.kind === 'rate-limited'
        ? `Too many attempts — please wait ${Math.ceil((error.retryAfterMs ?? 60_000) / 1000)} s and try again.`
        : error.kind === 'still-capturing'
          ? 'This recording is active in another tab. Take it over from the recovery screen.'
          : error.message
      : error instanceof Error
        ? error.message
        : 'Recording could not be started.';
    this.dispatch({ type: 'FATAL' }, { errorMessage: message });
  }

  private attachStream(stream: MediaStream, deviceId: string | null): void {
    this.stream = stream;
    const track = stream.getAudioTracks?.()[0];
    const settings = track?.getSettings?.() ?? {};
    this.set({ selectedDeviceId: settings.deviceId ?? deviceId, micLost: false });
    if (track) {
      const onEnded = () => this.onMicLost();
      track.addEventListener?.('ended', onEnded);
      this.trackEndedCleanup = () => track.removeEventListener?.('ended', onEnded);
    }
    this.meter = null;
    if (this.deps.AudioContext) {
      try {
        this.meter = createLevelMeter(stream, this.deps.AudioContext);
      } catch {
        this.meter = null; // metering is optional; rotation falls back to the hard cap
      }
    }
  }

  private startSegment(index: number): void {
    const run = createSegmentRun({
      stream: this.stream!,
      segmentIndex: index,
      now: () => this.deps.now(),
      MediaRecorder: this.deps.MediaRecorder!,
      mimeType: this.mimeType,
      handlers: {
        onChunk: (blob, capturedAt) => this.onChunk(index, blob, capturedAt),
        onStopped: reason => this.onRunStopped(index, reason),
        onError: error => this.deps.log('recorder error', { segmentIndex: index, error: String(error) }),
      },
    });
    this.run = run;
    this.lastMediaEnd.set(index, this.clock.read());
    this.segmentStartedAt = this.deps.now();
    this.silence.reset();
    run.start(TIMESLICE_MS);
    this.clock.start();
    // Eager, in-order open: an empty segment still keeps indexes gapless.
    this.queue?.enqueue({ kind: 'open', segmentIndex: index });
    this.nextSegmentIndex = index + 1;
    this.set({ segmentIndex: index, partIndex: 0 });
  }

  // -------------------------------------------------------------------------
  // Chunks → local buffer → parts
  // -------------------------------------------------------------------------

  private onChunk(segmentIndex: number, blob: Blob, capturedAt: number): void {
    if (!this.recordingId) return;
    // Synchronous bookkeeping FIRST: timing, then seq/part/seal per slice.
    const mediaEndMs = this.clock.read();
    const startMs = this.lastMediaEnd.get(segmentIndex) ?? mediaEndMs;
    const durationMs = Math.max(0, mediaEndMs - startMs);
    this.lastMediaEnd.set(segmentIndex, mediaEndMs);
    const forceSeal = this.flushOnNextBlob && this.run?.segmentIndex === segmentIndex;
    if (forceSeal) this.flushOnNextBlob = false;

    // A delayed dataavailable (after a long suspension or screen lock) can
    // carry far more than one timeslice. Split it into byte ranges of at most
    // PART_MAX_BYTES, each its own chunk with its own seq, so every part stays
    // < 2 × PART_MAX_BYTES (6 MiB) — under the server's 8 MiB cap — and
    // concatenation order is preserved. Blob.slice is synchronous and copy-free.
    const slices = splitBlob(blob, PART_MAX_BYTES);
    let offsetMs = startMs;
    slices.forEach((slice, i) => {
      const last = i === slices.length - 1;
      const sliceDuration = last
        ? mediaEndMs - offsetMs
        : Math.round((durationMs * slice.size) / blob.size);
      offsetMs += sliceDuration;
      this.recordSlice(segmentIndex, slice, {
        durationMs: Math.max(0, sliceDuration),
        mediaEndMs: last ? mediaEndMs : offsetMs,
        capturedAt,
        forceSeal: forceSeal && last,
      });
    });

    this.set({ elapsedMs: mediaEndMs, partIndex: this.assembler.currentPartIndex(segmentIndex) });
    this.heartbeat?.poke();
    this.maybeRotate();
  }

  private recordSlice(
    segmentIndex: number,
    blob: Blob,
    meta: { durationMs: number; mediaEndMs: number; capturedAt: number; forceSeal: boolean }
  ): void {
    const seq = this.assembler.nextSeq(segmentIndex);
    const partIndex = this.assembler.currentPartIndex(segmentIndex);
    const chunk: StoredChunk = {
      recordingId: this.recordingId!,
      segmentIndex,
      seq,
      partIndex,
      blob,
      size: blob.size,
      durationMs: meta.durationMs,
      mediaEndMs: meta.mediaEndMs,
      capturedAt: meta.capturedAt,
    };
    const sealed = this.assembler.add(segmentIndex, chunk, { forceSeal: meta.forceSeal });

    // Issue the IDB put synchronously (capture order). It can fail two ways —
    // a rejected promise OR a synchronous throw (e.g. InvalidStateError on a
    // closed connection) — and both fall back to memory.
    let put: Promise<void>;
    try {
      put = this.store ? this.store.putChunk(chunk) : Promise.reject(new Error('no local store'));
    } catch (error) {
      put = Promise.reject(error);
    }
    put.catch(() => undefined); // handled in the chain; avoid an unhandled rejection meanwhile

    this.writeChain = this.writeChain.then(async () => {
      try {
        await put;
      } catch {
        this.keepInMemory(chunk);
      }
      if (sealed) this.enqueuePart(sealed);
    });
  }

  private keepInMemory(chunk: StoredChunk): void {
    const key = `${chunk.segmentIndex}/${chunk.partIndex}`;
    const list = this.memory.get(key) ?? [];
    list.push(chunk);
    this.memory.set(key, list);
    if (!this.snap.storageError) this.set({ storageError: true });
  }

  private enqueuePart(part: SealedPart): void {
    this.queue?.enqueue({ kind: 'part', ...part });
    this.set({ pendingParts: this.queue?.pendingParts() ?? 0 });
  }

  /** The run's final blob has already been handled (dataavailable precedes stop). */
  private onRunStopped(segmentIndex: number, reason: StopReason): void {
    this.writeChain = this.writeChain.then(() => this.finishSegment(segmentIndex));
    if (reason === 'device-lost' && this.run?.segmentIndex === segmentIndex) {
      this.run = null;
      this.onMicLost();
    }
  }

  private finishSegment(segmentIndex: number): void {
    const sealed = this.assembler.flush(segmentIndex);
    if (sealed) this.enqueuePart(sealed);
    const partCount = this.assembler.partCount(segmentIndex);
    // Never close an empty segment: the server requires ≥1, finalize skips it.
    if (partCount > 0) this.queue?.enqueue({ kind: 'close', segmentIndex, partCount });
  }

  /**
   * Stop a run and wait until its final blob and finishSegment are in the
   * write chain. Every stop is tracked so Stop can join them all — a rotated
   * or mic-lost run's late final blob must be uploaded before finalize.
   */
  private stopRun(run: SegmentRun, reason: StopReason): Promise<void> {
    const done = (async () => {
      await run.stop(reason);
      await this.writeChain;
    })();
    this.pendingStops.add(done);
    void done.finally(() => this.pendingStops.delete(done));
    return done;
  }

  /** Wait for every outstanding run stop (bounded: a wedged recorder can't block Stop forever). */
  private async joinPendingStops(): Promise<void> {
    const signal = new AbortController().signal;
    while (this.pendingStops.size > 0) {
      const all = Promise.all([...this.pendingStops]).then(() => true);
      const settled = await Promise.race([all, this.deps.sleep(STOP_JOIN_TIMEOUT_MS, signal).then(() => false)]);
      if (!settled) {
        this.deps.log('a recorder did not report stop in time; continuing', { pending: this.pendingStops.size });
        return;
      }
    }
    await this.writeChain;
  }

  private partSource(): PartSource {
    return {
      read: async (s, p) => {
        const stored = this.store ? await this.store.getPartChunks(this.recordingId!, s, p).catch(() => []) : [];
        const mem = this.memory.get(`${s}/${p}`) ?? [];
        const rows = [...stored, ...mem.filter(m => !stored.some(r => r.seq === m.seq))];
        return rows.sort((a, b) => a.seq - b.seq).map(r => r.blob);
      },
      ack: async (s, p) => {
        this.memory.delete(`${s}/${p}`);
        if (this.store) await this.store.deletePart(this.recordingId!, s, p).catch(() => 0);
      },
      lookup: async (s, p) => {
        const stored = this.store ? await this.store.getPartChunks(this.recordingId!, s, p).catch(() => []) : [];
        const rows: ChunkMeta[] = [...stored, ...(this.memory.get(`${s}/${p}`) ?? [])];
        if (rows.length === 0) return null;
        const seqs = rows.map(r => r.seq);
        return {
          segmentIndex: s,
          partIndex: p,
          firstSeq: Math.min(...seqs),
          lastSeq: Math.max(...seqs),
          size: rows.reduce((n, r) => n + r.size, 0),
          durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
          mediaEndMs: Math.max(...rows.map(r => r.mediaEndMs)),
        };
      },
    };
  }

  private createQueue(token: string, events: QueueEvents): UploadQueue {
    const deps: QueueDeps = {
      transport: this.deps.api.transport,
      parts: this.partSource(),
      mimeType: this.mimeType,
      now: () => this.deps.wallNow(),
      random: () => this.deps.random(),
      sleep: (ms, signal) => this.deps.sleep(ms, signal),
      isOnline: () => this.deps.isOnline(),
      waitOnline: signal => this.deps.waitOnline(signal),
    };
    return new UploadQueue(this.recordingId!, token, deps, events);
  }

  private liveQueueEvents(): QueueEvents {
    return {
      onPartAcked: (part, at) => {
        this.ackedThroughMs = Math.max(this.ackedThroughMs, part.mediaEndMs);
        this.set({
          savedThroughMs: this.savedThrough(),
          pendingParts: this.queue?.pendingParts() ?? 0,
          unresolved: this.unresolvedSummary(),
        });
        this.heartbeat?.noteImplicit(at);
      },
      onHealth: (health, lastError) => this.set({ uploadHealth: health, lastUploadError: lastError }),
      onRejected: (_job, message) =>
        this.set({
          lastUploadError: message,
          savedThroughMs: this.savedThrough(),
          unresolved: this.unresolvedSummary(),
        }),
      onPartsAbandoned: (segmentIndex, missing) =>
        this.deps.log('segment closed as a prefix; parts could not be recovered', { segmentIndex, missing }),
      onFatal: kind => this.onFatalFromServer(kind),
    };
  }

  /**
   * "Saved through" only advances across a CONTIGUOUS acknowledged prefix: a
   * refused part freezes it at that part's start, even if later parts land.
   */
  private savedThrough(): number {
    const refused = this.queue?.rejectedParts() ?? [];
    const barrier = refused.reduce(
      (min, part) => Math.min(min, part.mediaEndMs - part.durationMs),
      Number.POSITIVE_INFINITY
    );
    return Math.max(0, Math.min(this.ackedThroughMs, barrier));
  }

  private unresolvedSummary(): RecorderSnapshot['unresolved'] {
    const refused = this.queue?.rejectedParts() ?? [];
    if (refused.length === 0) return null;
    return {
      parts: refused.length,
      seconds: Math.max(1, Math.round(refused.reduce((n, p) => n + p.durationMs, 0) / 1000)),
    };
  }

  // -------------------------------------------------------------------------
  // Pause / resume / rotation / microphone
  // -------------------------------------------------------------------------

  pause(): void {
    if (this.snap.phase !== 'recording' || this.snap.micLost) return;
    if (!this.dispatch({ type: 'PAUSE' })) return;
    if (this.run) {
      // Force-seal the part so the audio before the break uploads during it.
      this.flushOnNextBlob = true;
      this.run.requestData();
      this.run.pause();
    }
    this.clock.pause();
    this.pausedAt = this.deps.now();
    this.pauseTimer = this.deps.setTimeout(() => this.checkLongPause(), PAUSE_CLOSES_SEGMENT_MS);
    this.heartbeat?.markDirty();
  }

  resume(): void {
    if (this.snap.phase !== 'paused') return;
    this.clearPauseTimer();
    if (this.run && this.run.state === 'paused') {
      this.run.resume();
      this.clock.start();
    } else if (!this.snap.micLost && this.stream) {
      // The long-pause close ended the segment: resume in a fresh one.
      this.startSegment(this.nextSegmentIndex);
    }
    this.dispatch({ type: 'RESUME' });
    this.heartbeat?.markDirty();
  }

  /** Close the segment after a long pause (timer, tick and visibility all check). */
  private checkLongPause(): void {
    if (this.snap.phase !== 'paused' || !this.run) return;
    if (!shouldCloseForPause(this.deps.now() - this.pausedAt)) return;
    const run = this.run;
    this.run = null;
    void this.stopRun(run, 'pause-timeout');
  }

  private maybeRotate(): void {
    if (this.snap.phase !== 'recording' || !this.run || this.stopRequested || this.snap.micLost) return;
    const now = this.deps.now();
    if (
      shouldRotate({
        segmentElapsedMs: now - this.segmentStartedAt,
        silentForMs: this.silence.silentForMs(now),
      })
    ) {
      this.rotate();
    }
  }

  /** New run first, then stop the old one — a tiny overlap beats any gap. */
  private rotate(): void {
    const old = this.run;
    if (!old) return;
    this.startSegment(this.nextSegmentIndex);
    void this.stopRun(old, 'rotate');
  }

  private onMicLost(): void {
    if (!this.isCapturing() || this.snap.phase === 'stopping' || this.snap.micLost) return;
    this.clock.pause();
    if (this.run) {
      const run = this.run;
      this.run = null;
      void this.stopRun(run, 'device-lost');
    }
    this.set({ micLost: true });
    this.heartbeat?.markDirty(); // report 'paused' while no audio flows
    void this.refreshDevices();
  }

  /** Pick a microphone while capturing: ends the segment, starts a new one. */
  async selectDevice(deviceId: string): Promise<void> {
    if (!this.isCapturing() || this.snap.phase === 'stopping' || !this.deps.mediaDevices) return;
    const gen = this.captureGen;
    // Stop / takeover / dispose while we awaited: never attach the new mic
    // to a recorder that has moved on — release it immediately.
    const stale = () => gen !== this.captureGen || this.disposed || !this.isCapturing() || this.snap.phase === 'stopping';
    let acquired;
    try {
      acquired = await acquireMicStream(this.deps.mediaDevices, deviceId);
    } catch (error) {
      if (!stale()) this.set({ errorMessage: toMicError(error).message });
      return;
    }
    if (stale()) {
      this.stopTracks(acquired.stream);
      return;
    }
    if (this.run) {
      const run = this.run;
      this.run = null;
      await this.stopRun(run, 'mic-change');
    }
    if (stale()) {
      this.stopTracks(acquired.stream);
      return;
    }
    this.releaseStream();
    this.attachStream(acquired.stream, acquired.deviceId ?? deviceId);
    this.set({ errorMessage: null });
    if (this.snap.phase === 'recording') this.startSegment(this.nextSegmentIndex);
    this.heartbeat?.markDirty();
    void this.refreshDevices();
  }

  private async refreshDevices(): Promise<void> {
    if (!this.deps.mediaDevices) return;
    try {
      this.set({ devices: await listAudioInputs(this.deps.mediaDevices) });
    } catch {
      // enumerateDevices can fail transiently; the list is cosmetic
    }
  }

  // -------------------------------------------------------------------------
  // Stop → tail → finalize
  // -------------------------------------------------------------------------

  /** One click, no confirm. Keeps heartbeating until finalize is posted. */
  async stop(): Promise<void> {
    if (this.snap.phase !== 'recording' && this.snap.phase !== 'paused') return;
    this.stopRequested = true;
    this.captureGen++;
    if (!this.dispatch({ type: 'STOP' })) return;
    this.clearPauseTimer();
    this.stopSampling();
    if (this.run) {
      const run = this.run;
      this.run = null;
      void this.stopRun(run, 'user-stop');
    }
    // Join EVERY outstanding stop — the current run and any rotated, mic-lost
    // or long-paused run whose final blob may still be in flight.
    await this.joinPendingStops();
    this.clock.pause();
    await this.writeChain;
    this.releaseStream();
    await this.releaseWakeLock();
    if (!this.dispatch({ type: 'CAPTURE_STOPPED' }, { pendingParts: this.queue?.pendingParts() ?? 0 })) return;
    await this.drainTailThenFinalize();
  }

  /**
   * Upload everything left, then finalize — unless the server refused parts,
   * in which case stop in 'tail-blocked' and let the user retry or explicitly
   * accept the loss. Finalize must never silently assemble across a gap.
   */
  private async drainTailThenFinalize(): Promise<void> {
    this.clearAbandonTimer();
    this.abandonTimer = this.deps.setTimeout(() => {
      if (this.snap.phase === 'uploading-tail' && this.snap.uploadHealth !== 'ok') {
        this.set({ abandonAvailable: true });
      }
    }, ABANDON_AFTER_MS);

    try {
      await this.queue?.drained();
    } catch {
      if (!this.abandoning) return; // a fatal verdict already moved us on
    }
    this.clearAbandonTimer();

    const unresolved = this.unresolvedSummary();
    if (unresolved && !this.abandoning) {
      this.dispatch({ type: 'TAIL_BLOCKED' }, {
        abandonAvailable: false,
        unresolved,
        savedThroughMs: this.savedThrough(),
      });
      return; // heartbeat keeps running: this tab still owns the recording
    }

    this.heartbeat?.stop();
    if (!this.dispatch({ type: 'TAIL_UPLOADED' }, { abandonAvailable: false })) return;
    await this.finalizeAndPoll({ token: this.token });
  }

  /** tail-blocked: try the refused parts again. */
  async retryTail(): Promise<void> {
    if (this.snap.phase !== 'tail-blocked') return;
    this.queue?.requeueRejected();
    if (!this.dispatch({ type: 'RETRY_TAIL' }, { unresolved: null })) return;
    await this.drainTailThenFinalize();
  }

  /** tail-blocked: the user accepted losing the refused parts. */
  async finalizeAcceptingLoss(): Promise<void> {
    if (this.snap.phase !== 'tail-blocked') return;
    this.queue?.abandonRejected();
    this.heartbeat?.stop();
    if (!this.dispatch({ type: 'CHOOSE_FINALIZE' }, { unresolved: null })) return;
    await this.finalizeAndPoll({ token: this.token });
  }

  /** Give up on a stalled tail (the user was warned it is then lost). */
  abandonTailAndFinalize(): void {
    if (this.snap.phase !== 'uploading-tail') return;
    this.abandoning = true;
    this.queue?.stop();
  }

  private async finalizeAndPoll(opts: { token?: string | null; force?: boolean }): Promise<void> {
    const recordingId = this.recordingId!;
    const signal = new AbortController().signal;
    for (;;) {
      if (this.disposed) return;
      try {
        await this.deps.api.finalizeRecording(recordingId, opts);
        break;
      } catch (error) {
        const kind = isRecorderApiError(error) ? error.kind : 'network';
        if (kind === 'already-finalizing') break;
        if (kind === 'nothing-captured') {
          this.dispatch({ type: 'FINALIZE_FAILED' }, {
            finalize: {
              status: null,
              errorMessage: 'Nothing was recorded — no audio reached the server.',
              attempts: null,
              nothingCaptured: true,
            },
          });
          return;
        }
        if (kind === 'not-found') {
          this.set({ redirectTo: '/sessions' });
          return;
        }
        if (kind === 'network' || kind === 'retryable' || kind === 'rate-limited' || kind === 'auth') {
          await this.deps.sleep(FINALIZE_POLL_MS, signal);
          continue;
        }
        this.dispatch({ type: 'FINALIZE_FAILED' }, {
          finalize: {
            status: null,
            errorMessage: error instanceof Error ? error.message : 'Assembly could not start.',
            attempts: null,
            nothingCaptured: false,
          },
        });
        return;
      }
    }
    await this.pollFinalize();
  }

  private async pollFinalize(): Promise<void> {
    const recordingId = this.recordingId!;
    const signal = new AbortController().signal;
    for (;;) {
      if (this.disposed) return;
      let recording: RecordingState;
      try {
        recording = await this.deps.api.getRecording(recordingId);
      } catch (error) {
        if (isRecorderApiError(error) && error.kind === 'not-found') {
          this.set({ redirectTo: '/sessions' });
          return;
        }
        await this.deps.sleep(FINALIZE_POLL_MS, signal);
        continue;
      }

      if (recording.status === 'finalized') {
        await this.purgeLocal(recordingId);
        await this.waitForProcessingHandoff();
        this.releaseHeldLock();
        this.dispatch({ type: 'FINALIZE_POLL', status: 'finalized' }, {
          finalize: { ...this.snap.finalize, status: 'finalized', errorMessage: null },
          redirectTo: `/sessions/${this.sessionId}?initialState=processing`,
        });
        return;
      }
      if (recording.status === 'failed') {
        this.dispatch({ type: 'FINALIZE_POLL', status: 'failed' }, {
          finalize: {
            status: 'failed',
            errorMessage: recording.errorMessage ?? 'Assembling the recording failed.',
            attempts: this.snap.finalize.attempts,
            nothingCaptured: false,
          },
        });
        return;
      }

      let attempts: number | null = null;
      try {
        const progress = await this.deps.api.getSessionProgress(this.sessionId);
        if (progress.job?.type === 'finalize_recording') attempts = progress.job.attempts;
      } catch {
        // progress is cosmetic here
      }
      this.set({ finalize: { ...this.snap.finalize, status: recording.status, attempts } });
      await this.deps.sleep(FINALIZE_POLL_MS, signal);
    }
  }

  /**
   * 'finalized' lands just before the worker enqueues transcription. Wait
   * (briefly) for the session to leave 'uploaded' so the detail page doesn't
   * flash a Start button — but never forever: 'uploaded' with no job is
   * legitimate for test accounts without mocked AI.
   */
  private async waitForProcessingHandoff(): Promise<void> {
    const deadline = this.deps.now() + HANDOFF_GRACE_MS;
    const signal = new AbortController().signal;
    while (this.deps.now() < deadline && !this.disposed) {
      try {
        const progress = await this.deps.api.getSessionProgress(this.sessionId);
        if (progress.status !== 'draft' && progress.status !== 'uploaded') return;
      } catch {
        return;
      }
      await this.deps.sleep(1000, signal);
    }
  }

  // -------------------------------------------------------------------------
  // Server verdicts
  // -------------------------------------------------------------------------

  private onFatalFromServer(kind: RecorderErrorKind): void {
    if (TERMINAL_PHASES.includes(this.snap.phase) || this.disposed) return;

    if (kind === 'recording-too-large') {
      this.set({ errorMessage: 'The recording reached its maximum length and was stopped.' });
      void this.stopAtLimit();
      return;
    }

    this.haltCapture();
    if (kind === 'segment-gap') {
      this.dispatch({ type: 'FATAL' }, {
        errorMessage:
          'The recorder lost track of its segments. Everything uploaded is safe — reload this page to recover the rest.',
      });
      return;
    }
    const message =
      kind === 'stale-token'
        ? 'This recording was taken over in another tab. Recording here has stopped; everything already uploaded is safe.'
        : kind === 'not-found'
          ? 'This recording was discarded or its session deleted elsewhere. Recording here has stopped.'
          : 'This recording was finalized elsewhere. Recording here has stopped.';
    void this.pendingSeconds().then(seconds => {
      const suffix =
        seconds > 0 ? ` About ${Math.max(1, Math.round(seconds / 60))} min of audio from this tab could not be attached.` : '';
      this.dispatch({ type: 'TAKEN_OVER' }, { takenOverMessage: message + suffix });
    });
  }

  /** The server's size cap: finalize what landed (the queue already stopped). */
  private async stopAtLimit(): Promise<void> {
    if (this.snap.phase !== 'recording' && this.snap.phase !== 'paused') return;
    this.dispatch({ type: 'STOP' });
    this.haltCapture();
    this.dispatch({ type: 'CAPTURE_STOPPED' });
    this.dispatch({ type: 'TAIL_UPLOADED' });
    await this.finalizeAndPoll({ token: this.token });
  }

  /** Stop capture hardware and background work; local rows are KEPT. */
  private haltCapture(): void {
    this.stopRequested = true;
    this.captureGen++;
    const run = this.run;
    this.run = null;
    if (run) void run.stop('user-stop');
    this.clock.pause();
    this.queue?.stop();
    this.heartbeat?.stop();
    this.clearPauseTimer();
    this.clearAbandonTimer();
    this.stopSampling();
    this.releaseStream();
    void this.releaseWakeLock();
    this.releaseHeldLock();
  }

  private async pendingSeconds(): Promise<number> {
    if (!this.store || !this.recordingId) return 0;
    try {
      const pending = await this.store.getPendingChunks(this.recordingId);
      return bytesToSeconds(pending.reduce((n, c) => n + c.size, 0));
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Bootstrap / recovery
  // -------------------------------------------------------------------------

  /**
   * Decide what the record page shows. Idempotent (memoized) and read-only
   * apart from a non-destructive drain with the STORED token — it never
   * takes over, never POSTs /recording.
   */
  bootstrap(userId: string): Promise<void> {
    if (this.snap.phase !== 'idle') return Promise.resolve();
    this.userId = userId;
    this.bootstrapPromise ??= this.doBootstrap()
      .catch(error => {
        this.dispatch({ type: 'FATAL' }, {
          errorMessage: error instanceof Error ? error.message : 'Could not load the recording.',
        });
      })
      .finally(() => this.set({ bootstrapped: true }));
    return this.bootstrapPromise;
  }

  private async doBootstrap(): Promise<void> {
    let info;
    try {
      info = await this.deps.api.getSessionRecording(this.sessionId);
    } catch (error) {
      if (isRecorderApiError(error) && error.kind === 'not-found') {
        this.set({ redirectTo: '/sessions' });
        return;
      }
      throw error;
    }
    if (this.snap.phase !== 'idle') return; // started while we were loading

    const store = await this.ensureStore();
    const recording = info.recording;
    await this.collectGarbage(store, recording?.id ?? null);

    const meta = recording && store ? await store.getMeta(recording.id).catch(() => null) : null;
    const pending = recording && store ? await store.getPendingChunks(recording.id).catch(() => []) : [];
    const lockHeld = recording ? await this.isLockHeld(recording.id) : false;

    const decision = decideRecovery({
      uploadId: info.uploadId,
      recordingStatus: recording?.status ?? null,
      pendingCount: pending.length,
      lockHeld,
    });
    if (recording) {
      this.recordingId = recording.id;
      this.set({ recordingId: recording.id });
    }
    if (meta) this.mimeType = meta.mimeType;

    switch (decision.action) {
      case 'redirect-session':
        this.set({ redirectTo: `/sessions/${this.sessionId}` });
        return;
      case 'fresh':
        return;
      case 'redirect-processing':
        this.set({ redirectTo: `/sessions/${this.sessionId}?initialState=processing` });
        return;
      case 'finalizing':
        // POST finalize again rather than only polling: if the server was
        // interrupted between marking 'finalizing' and enqueueing the job,
        // beginFinalize re-enqueues it (409 already_finalizing just polls).
        this.dispatch({ type: 'FINALIZING' });
        await this.finalizeAndPoll({ token: meta?.recorderToken ?? null });
        return;
      case 'failed': {
        const strandedSeconds = bytesToSeconds(pending.reduce((n, c) => n + c.size, 0));
        if (decision.strandLocal) await this.purgeLocal(recording!.id);
        await this.enterRecovery('failed', strandedSeconds);
        return;
      }
      case 'live-elsewhere':
        await this.enterRecovery('live-elsewhere', 0);
        return;
      case 'drain':
        await this.drainAndChoose(meta?.recorderToken ?? null, pending, recording!.status);
        return;
    }
  }

  private async enterRecovery(
    mode: RecoveryMode,
    strandedSeconds: number,
    drained = { done: 0, total: 0 },
    unresolvedSeconds = 0
  ): Promise<void> {
    let captured: RecordingState | null = null;
    try {
      captured = await this.deps.api.getRecording(this.recordingId!);
    } catch {
      captured = null;
    }
    if (this.snap.phase === 'idle') this.dispatch({ type: 'RECOVER' });
    this.takeoverForce = mode === 'live-elsewhere';
    this.dispatch({ type: 'RECOVERY_LOADED' }, {
      recovery: { mode, captured, drained, strandedSeconds, unresolvedSeconds },
    });
  }

  /**
   * Upload this browser's crash tail with the stored token (no takeover),
   * then offer Resume / Finalize / Discard.
   */
  private async drainAndChoose(
    storedToken: string | null,
    pending: ChunkMeta[],
    status: RecordingDisplayStatus
  ): Promise<void> {
    const recordingId = this.recordingId!;
    this.dispatch({ type: 'RECOVER' });
    if (pending.length === 0 || !storedToken) {
      // Interrupted elsewhere (or no local token): nothing this tab can upload.
      await this.enterRecovery(pending.length > 0 ? 'tail' : 'interrupted', 0);
      return;
    }

    let server: RecordingState | null = null;
    try {
      server = await this.deps.api.getRecording(recordingId);
    } catch (error) {
      if (!(isRecorderApiError(error) && error.kind === 'not-found')) throw error;
    }
    if (!server || isStranded(server.status)) {
      const seconds = bytesToSeconds(pending.reduce((n, c) => n + c.size, 0));
      await this.purgeLocal(recordingId);
      if (!server) {
        this.set({ redirectTo: `/sessions/${this.sessionId}` });
        return;
      }
      await this.enterRecovery(status === 'failed' ? 'failed' : 'interrupted', seconds);
      return;
    }

    const plan = planDrain(pending, server);
    let done = 0;
    this.set({
      recovery: {
        mode: 'tail',
        captured: server,
        drained: { done, total: plan.totalParts },
        strandedSeconds: 0,
        unresolvedSeconds: 0,
      },
    });
    const queue = this.createQueue(storedToken, {
      onPartAcked: () => {
        done++;
        if (this.snap.recovery) {
          this.set({ recovery: { ...this.snap.recovery, drained: { done, total: plan.totalParts } } });
        }
      },
      onHealth: (health, lastError) => this.set({ uploadHealth: health, lastUploadError: lastError }),
    });
    const outcome = await runDrain(queue, plan);
    this.nextSegmentIndex = Math.max(this.nextSegmentIndex, plan.nextSegmentIndex);

    if (outcome.kind === 'failed') {
      const kind = isRecorderApiError(outcome.error) ? outcome.error.kind : null;
      if (kind === 'stale-token') {
        // Someone took over: the user decides whether to take it back.
        await this.enterRecovery('live-elsewhere', 0, { done, total: plan.totalParts });
        return;
      }
      if (kind === 'not-capturing' || kind === 'not-found') {
        const seconds = await this.pendingSeconds();
        await this.purgeLocal(recordingId);
        await this.enterRecovery('interrupted', seconds, { done, total: plan.totalParts });
        return;
      }
    }
    this.token = storedToken; // still valid: nobody took over
    // Parts the server refused stay in IndexedDB; the card warns before a
    // finalize would skip them (they sit before any later audio).
    const refused = queue.rejectedParts();
    const unresolvedSeconds = refused.length
      ? Math.max(1, Math.round(refused.reduce((n, p) => n + p.durationMs, 0) / 1000))
      : 0;
    await this.enterRecovery('tail', 0, { done, total: plan.totalParts }, unresolvedSeconds);
    // The drain's PUTs refreshed the heartbeat, so a takeover now needs
    // force — legitimately: the accepted stored token proved this browser
    // owns the recording.
    this.takeoverForce = true;
  }

  /**
   * Take the recording over (rotates the token). Only from a click: the
   * Resume / Take over path. `force` is required when it is live elsewhere.
   */
  private async takeover(): Promise<void> {
    const resp = await this.deps.api.startOrTakeover(this.sessionId, this.mimeType, {
      force: this.takeoverForce,
    });
    this.recordingId = resp.recording.id;
    this.token = resp.recorderToken;
    this.tookOver = true;
    this.nextSegmentIndex = Math.max(this.nextSegmentIndex, resp.nextSegmentIndex);

    // A tail the stored-token drain couldn't upload (stale token): now we
    // hold the current token, so upload it before live capture resumes.
    const store = await this.ensureStore();
    const pending = store ? await store.getPendingChunks(resp.recording.id).catch(() => []) : [];
    if (pending.length > 0) {
      const plan = planDrain(pending, resp.recording);
      const outcome = await runDrain(this.createQueue(resp.recorderToken, {}), plan);
      if (outcome.kind === 'failed') throw outcome.error;
      this.nextSegmentIndex = Math.max(this.nextSegmentIndex, plan.nextSegmentIndex);
    }
  }

  /** Recovery card: Resume (or Take over) → back to pre-flight for the mic. */
  chooseResume(): void {
    if (this.snap.phase !== 'recovery-choice') return;
    if (this.snap.recovery?.mode === 'failed') return;
    this.dispatch({ type: 'CHOOSE_RESUME' });
  }

  /** Recovery card / failure: finalize what the server holds. */
  async chooseFinalize(): Promise<void> {
    const from = this.snap.phase;
    if (from !== 'recovery-choice' && from !== 'finalize-failed') return;
    const force = this.snap.recovery?.mode === 'live-elsewhere';
    if (!this.dispatch({ type: 'CHOOSE_FINALIZE' }, {
      finalize: { status: 'finalizing', errorMessage: null, attempts: null, nothingCaptured: false },
    })) return;
    await this.finalizeAndPoll({ token: this.token, force });
  }

  async chooseDiscard(): Promise<void> {
    const from = this.snap.phase;
    if (from !== 'recovery-choice' && from !== 'finalize-failed' && from !== 'tail-blocked') return;
    if (from === 'tail-blocked') this.heartbeat?.stop();
    const force = this.snap.recovery?.mode === 'live-elsewhere';
    if (!this.dispatch({ type: 'CHOOSE_DISCARD' })) return;
    try {
      await this.deps.api.discardRecording(this.recordingId!, { token: this.token, force });
    } catch (error) {
      if (!(isRecorderApiError(error) && error.kind === 'not-found')) {
        this.dispatch({ type: 'DISCARD_FAILED' }, {
          errorMessage: error instanceof Error ? error.message : 'Could not discard the recording.',
        });
        return;
      }
    }
    await this.purgeLocal(this.recordingId!);
    this.releaseHeldLock();
    this.dispatch({ type: 'DISCARDED' }, { redirectTo: `/sessions/${this.sessionId}` });
  }

  // -------------------------------------------------------------------------
  // Local store + locks
  // -------------------------------------------------------------------------

  private ensureStore(): Promise<RecorderStore | null> {
    this.storePromise ??= this.deps
      .openStore()
      .then(store => (this.store = store))
      .catch(error => {
        this.deps.log('local storage unavailable', { error: String(error) });
        this.set({ storageError: true });
        return null;
      });
    return this.storePromise;
  }

  private async purgeLocal(recordingId: string): Promise<void> {
    this.memory.clear();
    const store = await this.ensureStore();
    await store?.deleteRecording(recordingId).catch(() => undefined);
  }

  /** Drop other recordings of THIS session (discarded predecessors) and stale rows of this user. */
  private async collectGarbage(store: RecorderStore | null, currentRecordingId: string | null): Promise<void> {
    if (!store) return;
    try {
      const metas = await store.listMetas();
      const cutoff = this.deps.wallNow() - META_TTL_MS;
      for (const meta of metas) {
        if (meta.userId !== this.userId) continue; // never touch another account's tail
        const predecessor = meta.sessionId === this.sessionId && meta.recordingId !== currentRecordingId;
        if (predecessor || meta.updatedAt < cutoff) await store.deleteRecording(meta.recordingId);
      }
    } catch {
      // GC is best-effort
    }
  }

  private async isLockHeld(recordingId: string): Promise<boolean> {
    if (!this.deps.locks) return false;
    try {
      const got = await this.deps.locks.request(lockName(recordingId), { ifAvailable: true }, lock => lock !== null);
      return got === false;
    } catch {
      return false;
    }
  }

  /** Held while this tab captures; released on terminal outcomes (and tab death). */
  private holdLock(): void {
    if (!this.deps.locks || !this.recordingId || this.releaseLock) return;
    void this.deps.locks
      .request(lockName(this.recordingId), {}, () => new Promise<void>(resolve => (this.releaseLock = resolve)))
      .catch(() => undefined);
  }

  private releaseHeldLock(): void {
    this.releaseLock?.();
    this.releaseLock = null;
  }

  // -------------------------------------------------------------------------
  // Environment: sampling, visibility, wake lock
  // -------------------------------------------------------------------------

  private startSampling(): void {
    if (this.intervals.length > 0) return;
    this.intervals.push(
      this.deps.setInterval(() => {
        const rms = this.meter?.readRms() ?? null;
        const now = this.deps.now();
        this.silence.feed(rms, now);
        this.rmsTicks++;
        const patch: Partial<RecorderSnapshot> = { level: rms === null ? null : Math.min(1, rms * 8) };
        // HUD timer at ~1 Hz from the media clock.
        if (this.rmsTicks % Math.round(1000 / RMS_SAMPLE_MS) === 0 && this.snap.phase === 'recording') {
          patch.elapsedMs = this.clock.read();
        }
        this.set(patch);
        this.maybeRotate();
      }, RMS_SAMPLE_MS),
      this.deps.setInterval(() => {
        this.checkLongPause();
        this.maybeRotate();
      }, HEARTBEAT_TICK_MS)
    );
  }

  private stopSampling(): void {
    this.intervals.forEach(handle => this.deps.clearInterval(handle));
    this.intervals = [];
  }

  private installListeners(): void {
    if (this.cleanups.length > 0) return;
    this.cleanups.push(
      this.deps.onVisibilityChange(hidden => {
        if (!this.isCapturing()) return;
        if (hidden) {
          // Flush the partial slice into IndexedDB while the page is alive.
          if (this.snap.phase === 'recording') this.run?.requestData();
          return;
        }
        this.heartbeat?.markDirty();
        if (!this.wakeLock) void this.acquireWakeLock();
        this.checkLongPause();
        this.maybeRotate();
      }),
      this.deps.onDeviceChange(() => void this.refreshDevices())
    );
  }

  private async acquireWakeLock(): Promise<void> {
    const sentinel = await this.deps.requestWakeLock();
    if (!sentinel) {
      this.set({ wakeLockActive: false });
      return;
    }
    this.wakeLock = sentinel;
    sentinel.addEventListener('release', () => {
      if (this.wakeLock === sentinel) this.wakeLock = null;
      this.set({ wakeLockActive: false });
    });
    this.set({ wakeLockActive: true });
  }

  private async releaseWakeLock(): Promise<void> {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    await sentinel?.release().catch(() => undefined);
    this.set({ wakeLockActive: false });
  }

  private releaseStream(): void {
    this.trackEndedCleanup?.();
    this.trackEndedCleanup = null;
    void this.meter?.dispose();
    this.meter = null;
    if (this.stream) this.stopTracks(this.stream);
    this.stream = null;
  }

  private stopTracks(stream: MediaStream): void {
    stream.getTracks?.().forEach(track => track.stop());
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) this.deps.clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private clearAbandonTimer(): void {
    if (this.abandonTimer !== null) this.deps.clearTimeout(this.abandonTimer);
    this.abandonTimer = null;
  }

  /** Terminal cleanup / registry eviction only — NEVER from a React unmount. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.haltCapture();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.timers.forEach(handle => this.deps.clearTimeout(handle));
    this.timers = [];
    this.store?.close();
    this.listeners.clear();
  }
}
