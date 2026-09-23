import {
  PAUSE_CLOSES_SEGMENT_MS,
  ROTATION_HARD_CAP_MS,
  ROTATION_TARGET_MS,
  SILENCE_MIN_MS,
  SILENCE_RMS,
} from './constants';

/**
 * Tracks how long the input has been continuously below the silence
 * threshold. `null` means "level unknown" (e.g. a suspended AudioContext):
 * unknown is NEVER silence — rotation then falls back to the hard cap.
 */
export class SilenceDetector {
  private silentSince: number | null = null;

  constructor(private readonly threshold: number = SILENCE_RMS) {}

  feed(rms: number | null, nowMs: number): void {
    if (rms !== null && rms < this.threshold) {
      this.silentSince ??= nowMs;
    } else {
      this.silentSince = null;
    }
  }

  silentForMs(nowMs: number): number {
    return this.silentSince === null ? 0 : Math.max(0, nowMs - this.silentSince);
  }

  reset(): void {
    this.silentSince = null;
  }
}

/**
 * Rotate at the first silence after the target, or unconditionally at the
 * hard cap. Evaluate on every chunk and tick from `now - segmentStartedAt` —
 * never from a counted timer (hidden-tab timers throttle to ~1/min).
 */
export function shouldRotate(input: {
  segmentElapsedMs: number;
  silentForMs: number;
  targetMs?: number;
  hardCapMs?: number;
  minSilenceMs?: number;
}): boolean {
  const target = input.targetMs ?? ROTATION_TARGET_MS;
  const hardCap = input.hardCapMs ?? ROTATION_HARD_CAP_MS;
  const minSilence = input.minSilenceMs ?? SILENCE_MIN_MS;
  if (input.segmentElapsedMs >= hardCap) return true;
  return input.segmentElapsedMs >= target && input.silentForMs >= minSilence;
}

/** A long pause closes the segment so everything captured is durable. */
export function shouldCloseForPause(
  pausedForMs: number,
  limitMs: number = PAUSE_CLOSES_SEGMENT_MS
): boolean {
  return pausedForMs >= limitMs;
}
