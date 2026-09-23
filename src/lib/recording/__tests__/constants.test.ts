import { afterEach, describe, expect, it, vi } from 'vitest';

describe('recorder constants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to production tunables', async () => {
    const c = await import('../constants');
    expect(c.TIMESLICE_MS).toBe(10_000);
    expect(c.PART_MAX_DURATION_MS).toBe(90_000);
    expect(c.ROTATION_TARGET_MS).toBe(600_000);
    expect(c.ROTATION_HARD_CAP_MS).toBe(900_000);
    expect(c.PART_MAX_BYTES).toBeLessThan(8 * 1024 * 1024); // server cap
  });

  it('accepts the NEXT_PUBLIC test knobs and ignores garbage', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECORDING_TIMESLICE_MS', '1000');
    vi.stubEnv('NEXT_PUBLIC_RECORDING_PART_MAX_MS', '5000');
    vi.stubEnv('NEXT_PUBLIC_RECORDING_ROTATION_MS', 'soon');
    const c = await import('../constants');
    expect(c.TIMESLICE_MS).toBe(1000);
    expect(c.PART_MAX_DURATION_MS).toBe(5000);
    expect(c.ROTATION_TARGET_MS).toBe(600_000);
  });

  it('scales the hard cap with a rotation override', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECORDING_ROTATION_MS', '60000');
    const c = await import('../constants');
    expect(c.ROTATION_HARD_CAP_MS).toBe(90_000);
  });

  it('estimates seconds from bytes at 48kbps', async () => {
    const c = await import('../constants');
    expect(c.bytesToSeconds(21_600_000)).toBe(3600);
  });
});
