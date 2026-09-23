import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from './constants';

/**
 * Upload retry delay with equal jitter: uniformly in [base/2, base) where
 * base = min(cap, baseMs · 2^(attempt-1)). `attempt` starts at 1.
 */
export function computeRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
  opts: { baseMs?: number; capMs?: number } = {}
): number {
  const baseMs = opts.baseMs ?? BACKOFF_BASE_MS;
  const capMs = opts.capMs ?? BACKOFF_CAP_MS;
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(capMs, baseMs * 2 ** (n - 1));
  return Math.round(base / 2 + random() * (base / 2));
}

/** Parse a Retry-After header (seconds or HTTP-date) into ms from `now`. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
