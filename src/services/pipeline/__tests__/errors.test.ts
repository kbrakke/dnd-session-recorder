import { describe, it, expect } from 'vitest';
import {
  PermanentJobError,
  JobCancelledError,
  isPermanentError,
  isCancellation,
  errorMessage,
} from '../errors';
import { withTimeout, assertActive, StepContext } from '../util';

describe('error classification', () => {
  it('identifies permanent errors', () => {
    expect(isPermanentError(new PermanentJobError('missing file'))).toBe(true);
    expect(isPermanentError(new Error('ECONNRESET'))).toBe(false);
    expect(isPermanentError('string error')).toBe(false);
  });

  it('identifies cancellations', () => {
    expect(isCancellation(new JobCancelledError())).toBe(true);
    expect(isCancellation(new PermanentJobError('x'))).toBe(false);
  });

  it('extracts messages from non-Error throws', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain string')).toBe('plain string');
  });
});

describe('assertActive', () => {
  const ctx = (aborted: boolean): StepContext => ({
    jobId: 'job-1',
    isAbortRequested: () => aborted,
  });

  it('throws JobCancelledError when abort requested', () => {
    expect(() => assertActive(ctx(true))).toThrow(JobCancelledError);
  });

  it('passes when active', () => {
    expect(() => assertActive(ctx(false))).not.toThrow();
  });
});

describe('withTimeout', () => {
  it('resolves when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'too slow')).resolves.toBe(42);
  });

  it('rejects with the given message when the timeout wins', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 10, 'too slow')).rejects.toThrow('too slow');
  });

  it('propagates rejections from the wrapped promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('inner')), 1000, 'too slow')).rejects.toThrow(
      'inner'
    );
  });
});
