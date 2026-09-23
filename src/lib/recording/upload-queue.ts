import { OFFLINE_FALLBACK_MS } from './constants';
import { computeRetryDelayMs } from './backoff';
import { RecorderApiError, isRecorderApiError } from './api';
import type { RecorderErrorKind, RecorderTransport } from './api';
import type { SealedPart, UploadHealth, UploadJob } from './types';

/**
 * FIFO, single-consumer upload loop for one recording.
 *
 * Ordering is the whole point: only the HEAD job is ever in flight and it is
 * retried in place (head-of-line blocking), so segment opens stay gapless,
 * parts of a segment are ACKed in order (the un-ACKed parts of a segment are
 * always a suffix), and a close runs only after every earlier part landed.
 * Part bytes are read from the local buffer at send time — live and
 * crash-drained parts share one path and memory holds only metadata.
 */

export type QueueState = 'idle' | 'running' | 'backoff' | 'stopped';

/** Where part bytes live (IndexedDB rows, or memory when storage failed). */
export interface PartSource {
  /** The part's chunk blobs in capture order ([] if nothing is stored). */
  read(segmentIndex: number, partIndex: number): Promise<Blob[]>;
  /** The server ACKed the part: drop the local copy. */
  ack(segmentIndex: number, partIndex: number): Promise<void>;
  /** Metadata for a locally held part (re-upload after close reports gaps). */
  lookup(segmentIndex: number, partIndex: number): Promise<SealedPart | null>;
}

export interface QueueDeps {
  transport: RecorderTransport;
  parts: PartSource;
  mimeType: string;
  now(): number;
  random(): number;
  /** Resolves after `ms` or when `signal` aborts (never rejects). */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  isOnline(): boolean;
  /** Resolves on the next 'online' event or when `signal` aborts. */
  waitOnline(signal: AbortSignal): Promise<void>;
}

export type QueueFatalKind = Extract<
  RecorderErrorKind,
  'stale-token' | 'not-capturing' | 'not-found' | 'segment-gap' | 'recording-too-large'
>;

export interface QueueEvents {
  onPartAcked?(part: SealedPart, at: number): void;
  onSegmentOpened?(segmentIndex: number): void;
  onSegmentClosed?(segmentIndex: number): void;
  /** Close reported gaps; locally held parts were re-queued before a re-close. */
  onPartsMissing?(segmentIndex: number, missing: number[]): void;
  /** Gaps that could not be filled: the segment stays a contiguous prefix. */
  onPartsAbandoned?(segmentIndex: number, missing: number[]): void;
  onHealth?(health: UploadHealth, lastError: string | null): void;
  /** Terminal: the queue stopped. Local rows are kept. */
  onFatal?(kind: QueueFatalKind, message: string): void;
  /** A job the server permanently refused (client bug); dropped, rows kept. */
  onRejected?(job: UploadJob, message: string): void;
}

export class QueueStoppedError extends Error {
  constructor() {
    super('Upload queue stopped');
    this.name = 'QueueStoppedError';
  }
}

const FATAL_KINDS: ReadonlySet<RecorderErrorKind> = new Set<RecorderErrorKind>([
  'stale-token',
  'not-capturing',
  'not-found',
  'segment-gap',
  'recording-too-large',
]);

const RETRY_KINDS: ReadonlySet<RecorderErrorKind> = new Set<RecorderErrorKind>([
  'network',
  'retryable',
  'rate-limited',
]);

/** Re-open a missing segment at most this many times before giving up. */
const MAX_REOPENS_PER_SEGMENT = 3;

type Waiter = { resolve(): void; reject(error: Error): void };

export class UploadQueue {
  private jobs: UploadJob[] = [];
  private _state: QueueState = 'idle';
  private stopped = false;
  private fatal: Error | null = null;
  private attempt = 0;
  private health: UploadHealth = 'ok';
  private readonly abort = new AbortController();
  private waiters: Waiter[] = [];
  private readonly reopens = new Map<number, number>();
  private readonly closeRetries = new Map<number, number>();

  constructor(
    private readonly recordingId: string,
    private token: string,
    private readonly deps: QueueDeps,
    private readonly events: QueueEvents = {}
  ) {}

  get state(): QueueState {
    return this._state;
  }

  setToken(token: string): void {
    this.token = token;
  }

  enqueue(job: UploadJob): void {
    if (this.stopped) return;
    this.jobs.push(job);
    this.kick();
  }

  /** Put a job at the head (it runs after the one in flight, if any). */
  enqueueFront(job: UploadJob): void {
    if (this.stopped) return;
    this.jobs.unshift(job);
    this.kick();
  }

  pendingParts(): number {
    return this.jobs.filter(j => j.kind === 'part').length;
  }

  snapshotJobs(): readonly UploadJob[] {
    return [...this.jobs];
  }

  /** Resolves once every job is done; rejects if the queue stops first. */
  drained(): Promise<void> {
    if (this.stopped) return Promise.reject(this.fatal ?? new QueueStoppedError());
    if (this._state === 'idle' && this.jobs.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  /** Stop without a server verdict (e.g. finalize without the tail). */
  stop(): void {
    this.halt(new QueueStoppedError());
  }

  private kick(): void {
    if (this._state === 'idle') void this.run();
  }

  private async run(): Promise<void> {
    this._state = 'running';
    while (this.jobs.length > 0 && !this.stopped) {
      if (!this.deps.isOnline()) {
        this.setHealth('offline', null);
        this._state = 'backoff';
        await Promise.race([
          this.deps.waitOnline(this.abort.signal),
          this.deps.sleep(OFFLINE_FALLBACK_MS, this.abort.signal),
        ]);
        if (this.stopped) return;
        this._state = 'running';
        continue;
      }

      const job = this.jobs[0];
      try {
        await this.execute(job);
        if (this.stopped) return;
        this.remove(job);
        this.attempt = 0;
        this.setHealth('ok', null);
      } catch (e) {
        if (this.stopped) return;
        const err = isRecorderApiError(e)
          ? e
          : new RecorderApiError('network', e instanceof Error ? e.message : String(e), null);
        const next = await this.handleError(job, err);
        if (next === 'stop') return;
        if (next === 'backoff') {
          this.attempt++;
          const delay = err.retryAfterMs ?? computeRetryDelayMs(this.attempt, this.deps.random);
          this._state = 'backoff';
          await this.deps.sleep(delay, this.abort.signal);
          if (this.stopped) return;
          this._state = 'running';
        }
      }
    }
    if (this.stopped) return;
    this._state = 'idle';
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach(w => w.resolve());
  }

  private async execute(job: UploadJob): Promise<void> {
    switch (job.kind) {
      case 'open':
        await this.deps.transport.openSegment(this.recordingId, this.token, job.segmentIndex);
        this.events.onSegmentOpened?.(job.segmentIndex);
        return;
      case 'part': {
        const blobs = await this.deps.parts.read(job.segmentIndex, job.partIndex);
        if (blobs.length === 0) {
          throw new RecorderApiError('client-bug', 'Local audio for this part is missing', null);
        }
        const body = new Blob(blobs, { type: this.deps.mimeType });
        await this.deps.transport.putPart(
          this.recordingId,
          this.token,
          job.segmentIndex,
          job.partIndex,
          body
        );
        // Delete local rows ONLY after the server's 2xx.
        await this.deps.parts.ack(job.segmentIndex, job.partIndex);
        this.events.onPartAcked?.(stripKind(job), this.deps.now());
        return;
      }
      case 'close':
        await this.deps.transport.closeSegment(
          this.recordingId,
          this.token,
          job.segmentIndex,
          job.partCount
        );
        this.events.onSegmentClosed?.(job.segmentIndex);
        return;
    }
  }

  private async handleError(
    job: UploadJob,
    err: RecorderApiError
  ): Promise<'continue' | 'backoff' | 'stop'> {
    if (FATAL_KINDS.has(err.kind)) {
      this.events.onFatal?.(err.kind as QueueFatalKind, err.message);
      this.halt(err);
      return 'stop';
    }

    if (RETRY_KINDS.has(err.kind)) {
      if (this.attempt + 1 >= 3) this.setHealth('degraded', err.message);
      return 'backoff';
    }

    switch (err.kind) {
      case 'auth':
        // Signed out elsewhere: keep recording + buffering, keep retrying.
        this.setHealth('auth-expired', err.message);
        return 'backoff';

      case 'segment-not-found': {
        // The segment's open never reached the server (crash between the
        // local write and POST /segments). Opens are idempotent + gapless.
        const n = (this.reopens.get(job.segmentIndex) ?? 0) + 1;
        this.reopens.set(job.segmentIndex, n);
        if (job.kind === 'open' || n > MAX_REOPENS_PER_SEGMENT) {
          this.events.onFatal?.('segment-gap', err.message);
          this.halt(err);
          return 'stop';
        }
        this.jobs.unshift({ kind: 'open', segmentIndex: job.segmentIndex });
        return 'continue';
      }

      case 'segment-closed':
        // A closed segment passed close's integrity check, so the ledger
        // already holds this part: treat as ACK.
        if (job.kind === 'part') {
          await this.deps.parts.ack(job.segmentIndex, job.partIndex);
          this.events.onPartAcked?.(stripKind(job), this.deps.now());
        }
        this.remove(job);
        return 'continue';

      case 'parts-missing':
        if (job.kind === 'close') {
          await this.handlePartsMissing(job, err.missing);
        } else {
          this.remove(job);
        }
        return 'continue';

      default:
        // client-bug and anything unexpected: never retry a 4xx forever.
        this.remove(job);
        this.events.onRejected?.(job, err.message);
        this.setHealth('degraded', err.message);
        return 'continue';
    }
  }

  /**
   * Round 1: re-upload every missing part still held locally, then re-close
   * with the same count. Round 2: close as the contiguous prefix before the
   * first gap (or skip close when part 0 is gone). Finalize assembles an open
   * or closed segment's contiguous prefix either way — close is an integrity
   * check, never a prerequisite.
   */
  private async handlePartsMissing(
    job: Extract<UploadJob, { kind: 'close' }>,
    missing: number[]
  ): Promise<void> {
    this.remove(job);
    const round = this.closeRetries.get(job.segmentIndex) ?? 0;
    this.closeRetries.set(job.segmentIndex, round + 1);
    const sorted = [...missing].sort((a, b) => a - b);

    if (round === 0) {
      const available: UploadJob[] = [];
      for (const partIndex of sorted) {
        const meta = await this.deps.parts.lookup(job.segmentIndex, partIndex);
        if (meta) available.push({ kind: 'part', ...meta });
      }
      this.jobs.unshift(...available, { kind: 'close', segmentIndex: job.segmentIndex, partCount: job.partCount });
      this.events.onPartsMissing?.(job.segmentIndex, sorted);
      return;
    }

    if (round === 1 && sorted.length > 0 && sorted[0] > 0) {
      this.jobs.unshift({ kind: 'close', segmentIndex: job.segmentIndex, partCount: sorted[0] });
    }
    this.events.onPartsAbandoned?.(job.segmentIndex, sorted);
  }

  private remove(job: UploadJob): void {
    const i = this.jobs.indexOf(job);
    if (i >= 0) this.jobs.splice(i, 1);
  }

  private setHealth(health: UploadHealth, lastError: string | null): void {
    if (health === this.health && health === 'ok') return;
    this.health = health;
    this.events.onHealth?.(health, lastError);
  }

  private halt(error: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.fatal = error;
    this._state = 'stopped';
    this.abort.abort();
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach(w => w.reject(error));
  }
}

function stripKind(job: Extract<UploadJob, { kind: 'part' }>): SealedPart {
  const { kind: _kind, ...part } = job;
  return part;
}

/**
 * Browser timing deps (sleep/online). Touches `window` only when called —
 * never at import time.
 */
export function browserQueueTiming(): Pick<QueueDeps, 'sleep' | 'isOnline' | 'waitOnline' | 'now' | 'random'> {
  return {
    now: () => Date.now(),
    random: () => Math.random(),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    sleep: (ms, signal) =>
      new Promise<void>(resolve => {
        if (signal.aborted) return resolve();
        const timer = setTimeout(done, ms);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done);
      }),
    waitOnline: signal =>
      new Promise<void>(resolve => {
        if (signal.aborted || typeof window === 'undefined') return resolve();
        function done() {
          window.removeEventListener('online', done);
          signal.removeEventListener('abort', done);
          resolve();
        }
        window.addEventListener('online', done);
        signal.addEventListener('abort', done);
      }),
  };
}
