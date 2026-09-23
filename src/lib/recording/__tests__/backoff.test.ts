import { describe, expect, it } from 'vitest';
import { computeRetryDelayMs, retryAfterMs } from '../backoff';

describe('computeRetryDelayMs', () => {
  it('uses equal jitter in [base/2, base)', () => {
    expect(computeRetryDelayMs(1, () => 0)).toBe(500);
    expect(computeRetryDelayMs(1, () => 0.999)).toBe(1000);
    expect(computeRetryDelayMs(3, () => 0)).toBe(2000);
  });

  it('doubles per attempt and caps at 60s', () => {
    expect(computeRetryDelayMs(4, () => 0.5)).toBe(6000);
    expect(computeRetryDelayMs(20, () => 0)).toBe(30_000);
    expect(computeRetryDelayMs(20, () => 0.999)).toBeLessThanOrEqual(60_000);
  });

  it('treats attempt < 1 as the first attempt', () => {
    expect(computeRetryDelayMs(0, () => 0)).toBe(500);
  });
});

describe('retryAfterMs', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  it('parses seconds', () => {
    expect(retryAfterMs('7', now)).toBe(7000);
  });
  it('parses an HTTP date relative to now', () => {
    expect(retryAfterMs('Tue, 22 Sep 2026 12:00:30 GMT', now)).toBe(30_000);
  });
  it('clamps past dates to 0 and rejects garbage', () => {
    expect(retryAfterMs('Tue, 22 Sep 2026 11:00:00 GMT', now)).toBe(0);
    expect(retryAfterMs('soon', now)).toBeNull();
    expect(retryAfterMs(null, now)).toBeNull();
  });
});
