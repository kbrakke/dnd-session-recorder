import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { checkRecordingSupport, probeIndexedDB } from '../capabilities';
import type { CapabilityWindow } from '../capabilities';

function chromeLike(over: Partial<CapabilityWindow> = {}): CapabilityWindow {
  return {
    isSecureContext: true,
    navigator: { mediaDevices: { getUserMedia: () => undefined }, wakeLock: {}, storage: { persist: () => undefined } },
    MediaRecorder: { isTypeSupported: t => t === 'audio/webm;codecs=opus' },
    indexedDB: new IDBFactory(),
    ...over,
  };
}

describe('checkRecordingSupport', () => {
  it('supports a Chrome-like browser', async () => {
    const r = await checkRecordingSupport(chromeLike());
    expect(r).toEqual({ supported: true, reasons: [], wakeLock: true, persistStorage: true });
  });

  it('hard-blocks Safari-like browsers without webm/opus', async () => {
    const r = await checkRecordingSupport(chromeLike({ MediaRecorder: { isTypeSupported: t => t === 'audio/mp4' } }));
    expect(r.supported).toBe(false);
    expect(r.reasons[0]).toMatch(/Opus/);
  });

  it('blocks when there is no MediaRecorder, microphone API, or secure context', async () => {
    const r = await checkRecordingSupport(chromeLike({ MediaRecorder: undefined, isSecureContext: false, navigator: {} }));
    expect(r.supported).toBe(false);
    expect(r.reasons).toHaveLength(3);
  });

  it('blocks when the indexedDB getter throws (Firefox with storage blocked)', async () => {
    const w = chromeLike();
    Object.defineProperty(w, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    const r = await checkRecordingSupport(w);
    expect(r.supported).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/IndexedDB/);
  });

  it('blocks when IndexedDB exists but cannot store', async () => {
    const broken = { open: () => { throw new DOMException('nope', 'InvalidStateError'); } } as unknown as IDBFactory;
    const r = await checkRecordingSupport(chromeLike({ indexedDB: broken }));
    expect(r.supported).toBe(false);
  });

  it('a missing Wake Lock is a hint, not a block', async () => {
    const r = await checkRecordingSupport(chromeLike({ navigator: { mediaDevices: { getUserMedia: () => undefined } } }));
    expect(r.supported).toBe(true);
    expect(r.wakeLock).toBe(false);
  });
});

describe('probeIndexedDB', () => {
  it('round-trips a byte', async () => {
    expect(await probeIndexedDB(new IDBFactory(), 1000)).toBe(true);
  });

  it('times out when open never completes', async () => {
    const hanging = { open: () => ({}) } as unknown as IDBFactory;
    expect(await probeIndexedDB(hanging, 20)).toBe(false);
  });
});
