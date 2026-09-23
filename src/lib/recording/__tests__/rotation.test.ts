import { describe, expect, it } from 'vitest';
import { SilenceDetector, shouldCloseForPause, shouldRotate } from '../rotation';

describe('SilenceDetector', () => {
  it('accumulates only while below the threshold', () => {
    const d = new SilenceDetector(0.01);
    d.feed(0.005, 1000);
    d.feed(0.004, 1300);
    expect(d.silentForMs(1500)).toBe(500);
    d.feed(0.2, 1600);
    expect(d.silentForMs(1700)).toBe(0);
  });

  it('treats an unknown level (null) as NOT silent', () => {
    const d = new SilenceDetector(0.01);
    d.feed(0.001, 0);
    d.feed(null, 100);
    expect(d.silentForMs(5000)).toBe(0);
  });

  it('reset clears the run', () => {
    const d = new SilenceDetector();
    d.feed(0, 0);
    d.reset();
    expect(d.silentForMs(10_000)).toBe(0);
  });
});

describe('shouldRotate', () => {
  const base = { targetMs: 600_000, hardCapMs: 900_000, minSilenceMs: 400 };
  it('never rotates before the target', () => {
    expect(shouldRotate({ ...base, segmentElapsedMs: 599_999, silentForMs: 10_000 })).toBe(false);
  });
  it('rotates after the target once silence lasted long enough', () => {
    expect(shouldRotate({ ...base, segmentElapsedMs: 600_000, silentForMs: 399 })).toBe(false);
    expect(shouldRotate({ ...base, segmentElapsedMs: 600_000, silentForMs: 400 })).toBe(true);
  });
  it('rotates at the hard cap regardless of silence', () => {
    expect(shouldRotate({ ...base, segmentElapsedMs: 900_000, silentForMs: 0 })).toBe(true);
  });
});

describe('shouldCloseForPause', () => {
  it('closes after the limit', () => {
    expect(shouldCloseForPause(1_799_999)).toBe(false);
    expect(shouldCloseForPause(1_800_000)).toBe(true);
    expect(shouldCloseForPause(5, 5)).toBe(true);
  });
});
