import { IDB_PROBE_NAME, IDB_TIMEOUT_MS, RECORDING_MIME_TYPE } from './constants';
import { openDatabase, txDone } from './idb-store';

/**
 * Pre-flight hard-block gate (decision 4). Unsupported → explain and point
 * at /sessions/upload; there is no degraded recording path.
 *
 * Never touches `window` / `navigator` / `indexedDB` at module scope — the
 * record pages are SSR-prerendered even as client components.
 */

export interface CapabilityReport {
  supported: boolean;
  reasons: string[];
  /** Screen Wake Lock available. Missing is a hint, never a block. */
  wakeLock: boolean;
  persistStorage: boolean;
}

/** The subset of `window` the check reads (a fake in tests). */
export interface CapabilityWindow {
  isSecureContext?: boolean;
  navigator?: {
    mediaDevices?: { getUserMedia?: unknown };
    wakeLock?: unknown;
    storage?: { persist?: unknown };
  };
  MediaRecorder?: { isTypeSupported(type: string): boolean };
  indexedDB?: IDBFactory;
}

export async function checkRecordingSupport(
  win?: CapabilityWindow,
  opts: { timeoutMs?: number } = {}
): Promise<CapabilityReport> {
  const w: CapabilityWindow =
    win ?? (typeof window === 'undefined' ? {} : (window as unknown as CapabilityWindow));
  const reasons: string[] = [];

  if (w.isSecureContext === false) {
    reasons.push('Recording requires a secure (https) connection.');
  }
  if (typeof w.navigator?.mediaDevices?.getUserMedia !== 'function') {
    reasons.push('This browser cannot access a microphone.');
  }
  if (!w.MediaRecorder || typeof w.MediaRecorder.isTypeSupported !== 'function') {
    reasons.push('This browser cannot record audio (no MediaRecorder).');
  } else if (!w.MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)) {
    reasons.push('This browser cannot record Opus audio in WebM.');
  }

  // Read the property itself inside try: Firefox with site storage blocked
  // throws SecurityError from the `indexedDB` getter.
  let factory: IDBFactory | undefined;
  try {
    factory = w.indexedDB;
  } catch {
    factory = undefined;
  }
  if (!factory) {
    reasons.push('Local storage (IndexedDB) is unavailable, so audio could not be buffered safely.');
  } else if (!(await probeIndexedDB(factory, opts.timeoutMs ?? IDB_TIMEOUT_MS))) {
    reasons.push('Local storage (IndexedDB) is blocked or full, so audio could not be buffered safely.');
  }

  return {
    supported: reasons.length === 0,
    reasons,
    wakeLock: !!w.navigator && 'wakeLock' in w.navigator && !!w.navigator.wakeLock,
    persistStorage: typeof w.navigator?.storage?.persist === 'function',
  };
}

/**
 * A REAL round trip: open, write one byte, read it back, delete it. An API
 * that exists but can't store (private-mode quirks, quota, blocked storage)
 * fails here instead of mid-session.
 */
export async function probeIndexedDB(factory: IDBFactory, timeoutMs: number): Promise<boolean> {
  const work = (async () => {
    const db = await openDatabase(
      factory,
      IDB_PROBE_NAME,
      1,
      d => {
        if (!d.objectStoreNames.contains('probe')) d.createObjectStore('probe');
      },
      timeoutMs
    );
    try {
      const write = db.transaction('probe', 'readwrite');
      write.objectStore('probe').put(new Uint8Array([1]), 'probe');
      await txDone(write);

      const read = db.transaction('probe', 'readonly');
      const value = await new Promise<unknown>((resolve, reject) => {
        const req = read.objectStore('probe').get('probe');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!(value instanceof Uint8Array) || value[0] !== 1) return false;

      const del = db.transaction('probe', 'readwrite');
      del.objectStore('probe').delete('probe');
      await txDone(del);
      return true;
    } finally {
      db.close();
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([work.catch(() => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
