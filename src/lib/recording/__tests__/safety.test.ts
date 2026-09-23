import { describe, expect, it } from 'vitest';
import { formatHms, safetyState } from '../safety';

describe('formatHms', () => {
  it('formats H:MM:SS and truncates', () => {
    expect(formatHms(0)).toBe('0:00:00');
    expect(formatHms(59_999)).toBe('0:00:59');
    expect(formatHms(5_025_000)).toBe('1:23:45');
    expect(formatHms(-5)).toBe('0:00:00');
  });
});

describe('safetyState', () => {
  const base = { savedThroughMs: 5_025_000, pendingParts: 0, storageError: false };
  it('reassures when everything is uploaded', () => {
    expect(safetyState({ ...base, health: 'ok' })).toEqual({ tone: 'ok', text: 'All audio saved through 1:23:45' });
  });
  it('shows uploading while a part is queued', () => {
    expect(safetyState({ ...base, health: 'ok', pendingParts: 1 }).text).toBe('Uploading… saved through 1:23:45');
  });
  it('warns when offline with the backlog', () => {
    const s = safetyState({ ...base, health: 'offline', pendingParts: 3 });
    expect(s.tone).toBe('warn');
    expect(s.text).toContain('3 parts waiting');
  });
  it('explains sign-out', () => {
    expect(safetyState({ ...base, health: 'auth-expired' }).text).toMatch(/Signed out/);
  });
  it('degraded reads as reconnecting', () => {
    expect(safetyState({ ...base, health: 'degraded' }).text).toMatch(/reconnecting/);
  });
  it('storage failure is an error regardless of health', () => {
    expect(safetyState({ ...base, health: 'ok', storageError: true })).toMatchObject({ tone: 'error' });
  });
});
