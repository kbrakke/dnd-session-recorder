import { describe, expect, it } from 'vitest';
import { MediaClock } from '../media-clock';

function clock(maxDelta = 12_000) {
  let t = 0;
  const c = new MediaClock(() => t, maxDelta);
  return { c, advance: (ms: number) => { t += ms; } };
}

describe('MediaClock', () => {
  it('counts only running time', () => {
    const { c, advance } = clock();
    c.start();
    advance(5000);
    expect(c.read()).toBe(5000);
    c.pause();
    advance(60_000);
    expect(c.read()).toBe(5000);
    c.start();
    advance(3000);
    expect(c.read()).toBe(8000);
  });

  it('clamps one oversized delta (laptop slept)', () => {
    const { c, advance } = clock(12_000);
    c.start();
    advance(10_000);
    c.read();
    advance(3_600_000);
    expect(c.read()).toBe(22_000);
  });

  it('start/pause are idempotent', () => {
    const { c, advance } = clock();
    c.start();
    c.start();
    advance(1000);
    c.pause();
    c.pause();
    expect(c.read()).toBe(1000);
    expect(c.isRunning).toBe(false);
  });

  it('is monotonic across many reads', () => {
    const { c, advance } = clock();
    c.start();
    let prev = 0;
    for (let i = 0; i < 50; i++) {
      advance(137);
      const v = c.read();
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(50 * 137);
  });
});
