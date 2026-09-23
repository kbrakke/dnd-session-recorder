import { RecorderEngine } from './engine';
import type { EngineDeps } from './engine';
import { CAPTURING_PHASES, GUARD_UNLOAD_PHASES } from './state-machine';

/**
 * One RecorderEngine per session per JS context, kept on `globalThis` — NOT
 * module scope, which Fast Refresh re-evaluates (same trick as the pipeline
 * worker's `globalThis.__pipelineWorker`). This is what lets capture survive
 * in-app navigation and StrictMode remounts: pages re-attach to the engine
 * instead of creating a second recorder.
 */

type Registry = {
  engines: Map<string, RecorderEngine>;
  listeners: Set<() => void>;
  unsubscribes: Map<string, () => void>;
};

function registry(): Registry {
  const g = globalThis as unknown as { __recorderEngines?: Registry };
  g.__recorderEngines ??= { engines: new Map(), listeners: new Set(), unsubscribes: new Map() };
  return g.__recorderEngines;
}

function notify(): void {
  registry().listeners.forEach(listener => listener());
}

export function getRecorderEngine(sessionId: string, deps?: Partial<EngineDeps>): RecorderEngine {
  const reg = registry();
  let engine = reg.engines.get(sessionId);
  if (!engine) {
    engine = new RecorderEngine(sessionId, deps);
    reg.engines.set(sessionId, engine);
    reg.unsubscribes.set(sessionId, engine.subscribe(notify));
    notify();
  }
  return engine;
}

export function peekRecorderEngine(sessionId: string): RecorderEngine | null {
  return registry().engines.get(sessionId) ?? null;
}

/** The engine currently capturing or holding an unfinished tail, if any. */
export function activeRecorderEngine(): RecorderEngine | null {
  for (const engine of registry().engines.values()) {
    const phase = engine.getSnapshot().phase;
    if (CAPTURING_PHASES.includes(phase) || phase === 'uploading-tail' || phase === 'tail-blocked') {
      return engine;
    }
  }
  return null;
}

/**
 * Whether closing/reloading the tab right now would lose audio: ANY engine
 * in the registry is capturing, uploading, or draining. Read at
 * `beforeunload` time, so it covers pages other than the recorder too.
 */
export function registryNeedsUnloadGuard(): boolean {
  for (const engine of registry().engines.values()) {
    if (GUARD_UNLOAD_PHASES.includes(engine.getSnapshot().phase)) return true;
  }
  return false;
}

/** Dispose and forget (after finalized / discarded / taken-over). */
export function evictRecorderEngine(sessionId: string): void {
  const reg = registry();
  const engine = reg.engines.get(sessionId);
  if (!engine) return;
  reg.unsubscribes.get(sessionId)?.();
  reg.unsubscribes.delete(sessionId);
  reg.engines.delete(sessionId);
  engine.dispose();
  notify();
}

/** Registry-wide change feed (engine added/removed or any snapshot change). */
export function subscribeRegistry(listener: () => void): () => void {
  const reg = registry();
  reg.listeners.add(listener);
  return () => reg.listeners.delete(listener);
}
