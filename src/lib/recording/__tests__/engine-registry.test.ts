import { afterEach, describe, expect, it } from 'vitest';
import {
  activeRecorderEngine,
  evictRecorderEngine,
  getRecorderEngine,
  registryNeedsUnloadGuard,
} from '../engine-registry';
import type { RecorderEngine } from '../engine';
import type { RecorderPhase } from '../types';

function setPhase(engine: RecorderEngine, phase: RecorderPhase) {
  // Test-only: force a snapshot phase without driving hardware.
  const e = engine as unknown as { snap: { phase: RecorderPhase } };
  e.snap = Object.freeze({ ...e.snap, phase });
}

describe('engine registry', () => {
  afterEach(() => {
    evictRecorderEngine('a');
    evictRecorderEngine('b');
  });

  it('returns one engine per session', () => {
    expect(getRecorderEngine('a')).toBe(getRecorderEngine('a'));
  });

  it('guards unload while ANY engine is capturing, uploading, or blocked — from any page', () => {
    const a = getRecorderEngine('a');
    getRecorderEngine('b');
    expect(registryNeedsUnloadGuard()).toBe(false);
    for (const phase of ['recording', 'paused', 'uploading-tail', 'tail-blocked', 'recovering'] as RecorderPhase[]) {
      setPhase(a, phase);
      expect(registryNeedsUnloadGuard()).toBe(true);
    }
    setPhase(a, 'finalizing');
    expect(registryNeedsUnloadGuard()).toBe(false);
  });

  it('reports a tail-blocked engine as active (the Navbar keeps linking back)', () => {
    const a = getRecorderEngine('a');
    setPhase(a, 'tail-blocked');
    expect(activeRecorderEngine()).toBe(a);
  });
});
