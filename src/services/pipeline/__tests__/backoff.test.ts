import { describe, it, expect } from 'vitest';
import {
  computeBackoffMs,
  shouldRetry,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
} from '../backoff';

describe('computeBackoffMs', () => {
  it('starts at the base delay for the first failed attempt', () => {
    expect(computeBackoffMs(1)).toBe(BACKOFF_BASE_MS);
  });

  it('doubles per attempt', () => {
    expect(computeBackoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(computeBackoffMs(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(computeBackoffMs(4)).toBe(BACKOFF_BASE_MS * 8);
  });

  it('caps at the max delay', () => {
    expect(computeBackoffMs(10)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoffMs(100)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoffMs(1000)).toBe(BACKOFF_MAX_MS);
  });

  it('tolerates attempt 0 (defensive)', () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_BASE_MS);
  });
});

describe('shouldRetry', () => {
  it('retries while attempts remain', () => {
    expect(shouldRetry(1, 5, false)).toBe(true);
    expect(shouldRetry(4, 5, false)).toBe(true);
  });

  it('stops at max attempts', () => {
    expect(shouldRetry(5, 5, false)).toBe(false);
    expect(shouldRetry(6, 5, false)).toBe(false);
  });

  it('never retries permanent failures', () => {
    expect(shouldRetry(1, 5, true)).toBe(false);
  });
});
