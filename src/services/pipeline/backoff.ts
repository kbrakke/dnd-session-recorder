/**
 * Retry policy for pipeline jobs. Pure functions so they can be unit tested.
 */

export const BACKOFF_BASE_MS = 30 * 1000; // first retry after 30s
export const BACKOFF_MAX_MS = 15 * 60 * 1000; // cap at 15 minutes

/**
 * Exponential backoff for the given attempt number (1-based: the attempt
 * that just failed). 30s, 60s, 120s, ... capped at 15 minutes.
 */
export function computeBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  // Cap the exponent before exponentiating to avoid overflow on huge values.
  const ms = BACKOFF_BASE_MS * Math.pow(2, Math.min(exponent, 30));
  return Math.min(ms, BACKOFF_MAX_MS);
}

/** Whether a job that just failed its Nth attempt should be retried. */
export function shouldRetry(attempts: number, maxAttempts: number, permanent: boolean): boolean {
  if (permanent) return false;
  return attempts < maxAttempts;
}
