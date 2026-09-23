'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { evictRecorderEngine, getRecorderEngine, peekRecorderEngine } from '@/lib/recording/engine-registry';
import { initialSnapshot } from '@/lib/recording/engine';
import type { RecorderEngine } from '@/lib/recording/engine';
import type { RecorderSnapshot } from '@/lib/recording/types';

const noopSubscribe = () => () => undefined;
const STALE_ON_MOUNT: readonly RecorderSnapshot['phase'][] = ['taken-over', 'error', 'finalized', 'discarded', 'unsupported'];
const serverSnapshots = new Map<string, RecorderSnapshot>();

/** Constant, frozen idle snapshot per session for SSR and hydration. */
function idleSnapshot(sessionId: string): RecorderSnapshot {
  let snap = serverSnapshots.get(sessionId);
  if (!snap) {
    snap = initialSnapshot(sessionId);
    serverSnapshots.set(sessionId, snap);
  }
  return snap;
}

/**
 * Attach to the session's recorder engine (one per session per tab, kept in
 * the registry). Nothing here starts capture: commands are called from click
 * handlers, and unmounting only unsubscribes — the engine keeps recording
 * across navigation and StrictMode remounts.
 */
export function useRecorderEngine(sessionId: string): {
  engine: RecorderEngine | null;
  snapshot: RecorderSnapshot;
} {
  // Never create engines during SSR (the registry lives on globalThis).
  const engine = useMemo(() => {
    if (typeof window === 'undefined') return null;
    // A previous visit's terminal engine (taken over, errored) is stale:
    // start this visit fresh. A LIVE engine is re-attached, never replaced.
    const existing = peekRecorderEngine(sessionId);
    if (existing && STALE_ON_MOUNT.includes(existing.getSnapshot().phase)) {
      evictRecorderEngine(sessionId);
    }
    return getRecorderEngine(sessionId);
  }, [sessionId]);
  const snapshot = useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getSnapshot : () => idleSnapshot(sessionId),
    () => idleSnapshot(sessionId)
  );
  return { engine, snapshot };
}
