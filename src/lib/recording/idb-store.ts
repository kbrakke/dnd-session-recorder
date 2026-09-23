import { IDB_NAME, IDB_TIMEOUT_MS, IDB_VERSION } from './constants';
import type { ChunkMeta, RecordingMeta, SealedPart, StoredChunk } from './types';

/**
 * IndexedDB adapter for the recorder's local buffer.
 *
 * Schema (`rpg-session-recorder`, v1 — fixed for Phase 1; a future schema is
 * a NEW database name, never a version bump):
 * - `recordings`  keyPath recordingId, index bySession (unique)
 * - `chunks`      keyPath [recordingId, segmentIndex, seq],
 *                 indexes byRecording, byPart [recordingId, segmentIndex, partIndex]
 *
 * Rules:
 * - One short transaction per operation. Never `await` anything that is not
 *   an IDB request between opening a transaction and its completion — the
 *   transaction auto-commits at the next task boundary and later requests
 *   throw TransactionInactiveError.
 * - `putChunk` issues its request synchronously when called, so callers in
 *   `ondataavailable` get capture-order writes with no await before the put.
 * - A chunk row exists ⇔ its bytes are not yet ACKed by the server.
 *
 * The IDBFactory is injectable: Vitest passes `new IDBFactory()` from
 * fake-indexeddb.
 */

export interface RecorderStore {
  putMeta(meta: RecordingMeta): Promise<void>;
  getMeta(recordingId: string): Promise<RecordingMeta | null>;
  getMetaBySession(sessionId: string): Promise<RecordingMeta | null>;
  listMetas(): Promise<RecordingMeta[]>;
  putChunk(chunk: StoredChunk): Promise<void>;
  /** Metadata only (no blobs), ordered by (segmentIndex, seq). */
  getPendingChunks(recordingId: string): Promise<ChunkMeta[]>;
  /** One part's rows with blobs, ordered by seq. */
  getPartChunks(recordingId: string, segmentIndex: number, partIndex: number): Promise<StoredChunk[]>;
  /** Delete one part's rows in a single transaction; returns rows deleted. */
  deletePart(recordingId: string, segmentIndex: number, partIndex: number): Promise<number>;
  /** Delete a recording's meta row and every chunk row. */
  deleteRecording(recordingId: string): Promise<void>;
  countPending(recordingId: string): Promise<number>;
  close(): void;
}

const META = 'recordings';
const CHUNKS = 'chunks';

/** Resolve when the transaction commits; reject on error OR abort. */
export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // QuotaExceededError typically surfaces as an abort, not a request error.
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    tx.onerror = () => reject(tx.error ?? new DOMException('Transaction failed', 'UnknownError'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDatabase(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
  timeoutMs: number = IDB_TIMEOUT_MS
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new DOMException('Opening local storage timed out', 'TimeoutError'))),
      timeoutMs
    );

    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, version);
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab asked to upgrade: we never bump versions in Phase 1, but
      // don't hold the connection hostage if a future build does.
      db.onversionchange = () => db.close();
      finish(() => resolve(db));
    };
    req.onerror = () => finish(() => reject(req.error));
    // Unreachable while the version never changes; wired anyway.
    req.onblocked = () => {
      setTimeout(
        () => finish(() => reject(new DOMException('Local storage is busy in another tab', 'InvalidStateError'))),
        timeoutMs
      );
    };
  });
}

function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(META)) {
    const meta = db.createObjectStore(META, { keyPath: 'recordingId' });
    meta.createIndex('bySession', 'sessionId', { unique: true });
  }
  if (!db.objectStoreNames.contains(CHUNKS)) {
    const chunks = db.createObjectStore(CHUNKS, { keyPath: ['recordingId', 'segmentIndex', 'seq'] });
    chunks.createIndex('byRecording', 'recordingId', { unique: false });
    chunks.createIndex('byPart', ['recordingId', 'segmentIndex', 'partIndex'], { unique: false });
  }
}

/** Readwrite with strict durability (fsync) where supported. */
function readwrite(db: IDBDatabase, stores: string | string[]): IDBTransaction {
  try {
    return db.transaction(stores, 'readwrite', { durability: 'strict' });
  } catch {
    return db.transaction(stores, 'readwrite');
  }
}

function stripBlob(chunk: StoredChunk): ChunkMeta {
  const { blob: _blob, ...meta } = chunk;
  return meta;
}

export async function openRecorderStore(
  factory?: IDBFactory,
  opts: { name?: string; timeoutMs?: number } = {}
): Promise<RecorderStore> {
  const idb = factory ?? globalThis.indexedDB;
  const db = await openDatabase(
    idb,
    opts.name ?? IDB_NAME,
    IDB_VERSION,
    upgradeSchema,
    opts.timeoutMs
  );

  return {
    async putMeta(meta) {
      const tx = readwrite(db, META);
      tx.objectStore(META).put(meta);
      await txDone(tx);
    },

    async getMeta(recordingId) {
      const tx = db.transaction(META, 'readonly');
      const row = await request<RecordingMeta | undefined>(tx.objectStore(META).get(recordingId));
      return row ?? null;
    },

    async getMetaBySession(sessionId) {
      const tx = db.transaction(META, 'readonly');
      const row = await request<RecordingMeta | undefined>(
        tx.objectStore(META).index('bySession').get(sessionId)
      );
      return row ?? null;
    },

    async listMetas() {
      const tx = db.transaction(META, 'readonly');
      return request<RecordingMeta[]>(tx.objectStore(META).getAll());
    },

    putChunk(chunk) {
      // Request issued synchronously — no await before the put.
      const tx = readwrite(db, CHUNKS);
      tx.objectStore(CHUNKS).put(chunk);
      return txDone(tx);
    },

    getPendingChunks(recordingId) {
      // byRecording iterates in (index key, primary key) order, i.e. by
      // (segmentIndex, seq). A cursor keeps memory to metadata only.
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNKS, 'readonly');
        const rows: ChunkMeta[] = [];
        const req = tx.objectStore(CHUNKS).index('byRecording').openCursor(recordingId);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve(rows);
          rows.push(stripBlob(cursor.value as StoredChunk));
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    },

    async getPartChunks(recordingId, segmentIndex, partIndex) {
      const tx = db.transaction(CHUNKS, 'readonly');
      const rows = await request<StoredChunk[]>(
        tx.objectStore(CHUNKS).index('byPart').getAll([recordingId, segmentIndex, partIndex])
      );
      return rows.sort((a, b) => a.seq - b.seq);
    },

    async deletePart(recordingId, segmentIndex, partIndex) {
      const tx = readwrite(db, CHUNKS);
      let deleted = 0;
      const req = tx
        .objectStore(CHUNKS)
        .index('byPart')
        .openCursor([recordingId, segmentIndex, partIndex]);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        deleted++;
        cursor.continue();
      };
      await txDone(tx);
      return deleted;
    },

    async deleteRecording(recordingId) {
      const tx = readwrite(db, [META, CHUNKS]);
      tx.objectStore(META).delete(recordingId);
      const req = tx.objectStore(CHUNKS).index('byRecording').openCursor(recordingId);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await txDone(tx);
    },

    async countPending(recordingId) {
      const tx = db.transaction(CHUNKS, 'readonly');
      return request<number>(tx.objectStore(CHUNKS).index('byRecording').count(recordingId));
    },

    close() {
      db.close();
    },
  };
}

/**
 * Group pending chunk metadata into parts, per segment, in ascending
 * (segment, part) order. Chunks were stamped with their partIndex at write
 * time, so the pending rows alone describe every un-ACKed part — including
 * the still-open part of a crashed segment, which simply becomes its final
 * part.
 */
export function groupPending(chunks: ChunkMeta[]): Map<number, Map<number, SealedPart>> {
  const sorted = [...chunks].sort(
    (a, b) => a.segmentIndex - b.segmentIndex || a.seq - b.seq
  );
  const segments = new Map<number, Map<number, SealedPart>>();
  for (const c of sorted) {
    let parts = segments.get(c.segmentIndex);
    if (!parts) {
      parts = new Map();
      segments.set(c.segmentIndex, parts);
    }
    const existing = parts.get(c.partIndex);
    if (!existing) {
      parts.set(c.partIndex, {
        segmentIndex: c.segmentIndex,
        partIndex: c.partIndex,
        firstSeq: c.seq,
        lastSeq: c.seq,
        size: c.size,
        durationMs: c.durationMs,
        mediaEndMs: c.mediaEndMs,
      });
    } else {
      existing.firstSeq = Math.min(existing.firstSeq, c.seq);
      existing.lastSeq = Math.max(existing.lastSeq, c.seq);
      existing.size += c.size;
      existing.durationMs += c.durationMs;
      existing.mediaEndMs = Math.max(existing.mediaEndMs, c.mediaEndMs);
    }
  }
  // Maps iterate in insertion order; re-sort parts within each segment.
  for (const [s, parts] of segments) {
    segments.set(s, new Map([...parts.entries()].sort((a, b) => a[0] - b[0])));
  }
  return segments;
}
