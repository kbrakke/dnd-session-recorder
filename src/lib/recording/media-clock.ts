import { CLOCK_SLACK_MS, TIMESLICE_MS } from './constants';

/**
 * Active-recording time: accumulates monotonic-clock deltas only while
 * running. Pauses are excluded by construction, and any single delta larger
 * than `maxDeltaMs` is clamped — a laptop that slept (or a frozen tab) must
 * not add its sleep time to "elapsed" or to "saved through".
 *
 * Drive `now` from performance.now(), never Date.now() (wall clock jumps).
 * Call `read()` at least once per timeslice while running (every chunk
 * does), so a legitimate gap between reads never exceeds the clamp.
 */
export class MediaClock {
  private accumulated = 0;
  private lastTick = 0;
  private running = false;

  constructor(
    private readonly now: () => number,
    private readonly maxDeltaMs: number = TIMESLICE_MS + CLOCK_SLACK_MS
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = this.now();
  }

  pause(): void {
    if (!this.running) return;
    this.advance();
    this.running = false;
  }

  /** Current active time (advances the clock). */
  read(): number {
    if (this.running) this.advance();
    return this.accumulated;
  }

  private advance(): void {
    const t = this.now();
    const delta = Math.max(0, t - this.lastTick);
    this.accumulated += Math.min(delta, this.maxDeltaMs);
    this.lastTick = t;
  }
}
