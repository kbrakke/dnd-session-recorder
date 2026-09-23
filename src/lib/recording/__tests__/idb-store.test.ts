import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { groupPending, openRecorderStore } from '../idb-store';
import type { RecorderStore } from '../idb-store';
import type { ChunkMeta, StoredChunk } from '../types';

function chunk(over: Partial<StoredChunk> & { seq: number }): StoredChunk {
  const bytes = new Uint8Array([over.seq, over.seq + 1]);
  return {
    recordingId: 'r1',
    segmentIndex: 0,
    partIndex: 0,
    blob: new Blob([bytes], { type: 'audio/webm' }),
    size: bytes.length,
    durationMs: 1000,
    mediaEndMs: (over.seq + 1) * 1000,
    capturedAt: 0,
    ...over,
  };
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

describe('openRecorderStore (fake-indexeddb)', () => {
  let store: RecorderStore;
  beforeEach(async () => {
    store = await openRecorderStore(new IDBFactory());
  });

  it('round-trips meta rows by id and by session', async () => {
    const meta = { recordingId: 'r1', sessionId: 's1', userId: 'u1', recorderToken: 't', mimeType: 'audio/webm', createdAt: 1, updatedAt: 1 };
    await store.putMeta(meta);
    expect(await store.getMeta('r1')).toEqual(meta);
    expect(await store.getMetaBySession('s1')).toEqual(meta);
    expect(await store.getMetaBySession('nope')).toBeNull();
    expect(await store.listMetas()).toHaveLength(1);
  });

  it('back-to-back puts with no awaits keep capture order and bytes', async () => {
    const a = chunk({ seq: 0 });
    const b = chunk({ seq: 1 });
    const p1 = store.putChunk(a); // issued synchronously
    const p2 = store.putChunk(b);
    await Promise.all([p1, p2]);
    const rows = await store.getPartChunks('r1', 0, 0);
    expect(rows.map(r => r.seq)).toEqual([0, 1]);
    const joined = new Blob(rows.map(r => r.blob));
    expect(await bytesOf(joined)).toEqual([0, 1, 1, 2]);
    expect(rows[0].blob.type).toBe('audio/webm');
  });

  it('lists pending metadata in (segment, seq) order without blobs', async () => {
    await store.putChunk(chunk({ seq: 1, segmentIndex: 1 }));
    await store.putChunk(chunk({ seq: 0, segmentIndex: 1 }));
    await store.putChunk(chunk({ seq: 5, segmentIndex: 0 }));
    await store.putChunk(chunk({ seq: 0, recordingId: 'other' }));
    const pending = await store.getPendingChunks('r1');
    expect(pending.map(c => [c.segmentIndex, c.seq])).toEqual([[0, 5], [1, 0], [1, 1]]);
    expect(pending[0]).not.toHaveProperty('blob');
    expect(await store.countPending('r1')).toBe(3);
  });

  it('deletePart removes exactly one part in one transaction', async () => {
    await store.putChunk(chunk({ seq: 0, partIndex: 0 }));
    await store.putChunk(chunk({ seq: 1, partIndex: 0 }));
    await store.putChunk(chunk({ seq: 2, partIndex: 1 }));
    expect(await store.deletePart('r1', 0, 0)).toBe(2);
    expect((await store.getPendingChunks('r1')).map(c => c.seq)).toEqual([2]);
    expect(await store.deletePart('r1', 0, 0)).toBe(0);
  });

  it('deleteRecording clears meta and chunks for that recording only', async () => {
    await store.putMeta({ recordingId: 'r1', sessionId: 's1', userId: 'u', recorderToken: 't', mimeType: 'm', createdAt: 0, updatedAt: 0 });
    await store.putChunk(chunk({ seq: 0 }));
    await store.putChunk(chunk({ seq: 0, recordingId: 'r2' }));
    await store.deleteRecording('r1');
    expect(await store.getMeta('r1')).toBeNull();
    expect(await store.countPending('r1')).toBe(0);
    expect(await store.countPending('r2')).toBe(1);
  });

  it('a put issued after a macrotask await inside a handler still persists', async () => {
    await new Promise(r => setTimeout(r, 0));
    await store.putChunk(chunk({ seq: 9 }));
    expect(await store.countPending('r1')).toBe(1);
  });

  it('rows stay until explicitly deleted (a failed upload must not lose them)', async () => {
    await store.putChunk(chunk({ seq: 0 }));
    const upload = async () => { throw new Error('network'); };
    await expect(upload()).rejects.toThrow();
    expect(await store.countPending('r1')).toBe(1);
  });
});

describe('groupPending', () => {
  const meta = (segmentIndex: number, seq: number, partIndex: number): ChunkMeta => ({
    recordingId: 'r', segmentIndex, seq, partIndex, size: 10, durationMs: 1000, mediaEndMs: seq * 1000 + segmentIndex * 100_000, capturedAt: 0,
  });

  it('groups by segment then part, ascending, with totals', () => {
    const grouped = groupPending([meta(1, 0, 0), meta(0, 3, 1), meta(0, 2, 1), meta(0, 4, 2)]);
    expect([...grouped.keys()]).toEqual([0, 1]);
    const seg0 = grouped.get(0)!;
    expect([...seg0.keys()]).toEqual([1, 2]);
    expect(seg0.get(1)).toMatchObject({ firstSeq: 2, lastSeq: 3, size: 20, durationMs: 2000, mediaEndMs: 3000 });
  });

  it('is empty for no rows', () => {
    expect(groupPending([]).size).toBe(0);
  });
});
