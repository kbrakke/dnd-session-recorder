import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TICK_MS } from './constants';
import { isRecorderApiError } from './api';
import type { RecorderTransport } from './api';

export type HeartbeatState = 'recording' | 'paused';

export interface HeartbeatDeps {
  transport: Pick<RecorderTransport, 'heartbeat'>;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface HeartbeatEvents {
  /** Terminal server verdict for THIS generation: stop capturing. */
  onFatal?(kind: 'stale-token' | 'not-capturing' | 'not-found', message: string): void;
  onAuthError?(message: string): void;
  onSent?(at: number): void;
}

/**
 * Liveness pings, resilient to background-tab timer throttling. Three
 * sources drive it: a coarse tick (throttled to ~60s in a hidden tab — still
 * well under the server's 180s staleness), `poke()` from every recorder
 * chunk (media events keep flowing in background tabs), and part ACKs via
 * `noteImplicit()` (the server treats a part upload as a heartbeat).
 *
 * Ordering: at most ONE request is in flight and the state is read when the
 * request is actually sent. Pause/resume call `markDirty()`, which sends as
 * soon as the in-flight request settles — so a heartbeat sent just before a
 * pause can never land after the pause's and overwrite it.
 *
 * `stop()` bumps a generation counter; a response to a request from an
 * older generation (e.g. a heartbeat racing the user's Stop → finalize) is
 * ignored instead of being read as "finalized elsewhere".
 */
export class Heartbeat {
  private handle: unknown = null;
  private running = false;
  private inFlight = false;
  private dirty = false;
  private generation = 0;
  private _lastSentAt = 0;
  private getState: () => HeartbeatState = () => 'recording';

  constructor(
    private readonly recordingId: string,
    private token: string,
    private readonly deps: HeartbeatDeps,
    private readonly events: HeartbeatEvents = {},
    private readonly intervalMs: number = HEARTBEAT_INTERVAL_MS,
    private readonly tickMs: number = HEARTBEAT_TICK_MS
  ) {}

  get lastSentAt(): number {
    return this._lastSentAt;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(getState: () => HeartbeatState): void {
    if (this.running) return;
    this.getState = getState;
    this.running = true;
    this.handle = this.deps.setInterval(() => this.poke(), this.tickMs);
    this.markDirty(); // announce immediately
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.dirty = false;
    if (this.handle !== null) {
      this.deps.clearInterval(this.handle);
      this.handle = null;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  /** Send if the interval has elapsed. Cheap; call often. */
  poke(): void {
    if (!this.running) return;
    if (this.deps.now() - this._lastSentAt >= this.intervalMs) this.markDirty();
  }

  /** Send as soon as possible (state change, visibility change). */
  markDirty(): void {
    if (!this.running) return;
    this.dirty = true;
    if (!this.inFlight) void this.send();
  }

  /** A part ACK refreshed the server heartbeat. */
  noteImplicit(at: number): void {
    this._lastSentAt = Math.max(this._lastSentAt, at);
  }

  private async send(): Promise<void> {
    if (!this.running || this.inFlight || !this.dirty) return;
    this.dirty = false;
    this.inFlight = true;
    const generation = this.generation;
    const state = this.getState(); // read at actual send time
    try {
      await this.deps.transport.heartbeat(this.recordingId, this.token, state);
      if (generation !== this.generation) return;
      this._lastSentAt = this.deps.now();
      this.events.onSent?.(this._lastSentAt);
    } catch (error) {
      if (generation !== this.generation) return; // stale response: ignore
      if (isRecorderApiError(error)) {
        if (error.kind === 'stale-token' || error.kind === 'not-capturing' || error.kind === 'not-found') {
          this.stop();
          this.events.onFatal?.(error.kind, error.message);
          return;
        }
        if (error.kind === 'auth') this.events.onAuthError?.(error.message);
      }
      // Network/5xx: ignore — the next poke retries, and parts carry beats.
    } finally {
      this.inFlight = false;
      // A restart during the request left `dirty` set; send for the new generation.
      if (this.running && this.dirty) void this.send();
    }
  }
}
