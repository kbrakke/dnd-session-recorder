import { describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RecorderEngine } from '../engine';
import type { EngineDeps, LocksLike } from '../engine';
import { RecorderApiError } from '../api';
import type { RecorderApi } from '../api';
import { openRecorderStore } from '../idb-store';
import type { RecorderStore } from '../idb-store';
import type { MediaRecorderLike } from '../capture';
import type { RecordingState } from '../types';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeRecorder implements MediaRecorderLike {
  static all: FakeRecorder[] = [];
  /** When set, stop() goes inactive but its final blob/stop wait for release(). */
  static holdStops = false;
  private held: (() => void) | null = null;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(public stream: MediaStream) {
    FakeRecorder.all.push(this);
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  requestData() { this.emit(5); }
  stop() {
    this.state = 'inactive';
    const finish = () => { this.emit(7); this.onstop?.(new Event('stop')); };
    if (FakeRecorder.holdStops) this.held = finish;
    else queueMicrotask(finish);
  }
  /** Deliver a held final blob + stop event. */
  release() { const f = this.held; this.held = null; f?.(); }
  emit(size: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size).fill(size % 250)]) }); }
}

function fakeStream(deviceId = 'mic-1') {
  const listeners: Record<string, Array<() => void>> = {};
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: vi.fn(),
    end: () => listeners.ended?.forEach(fn => fn()),
  };
  return { stream: { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream, track };
}

function recordingState(over: Partial<RecordingState> = {}): RecordingState {
  return {
    id: 'rec1', sessionId: 'sess1', status: 'recording', mimeType: 'audio/webm;codecs=opus',
    startedAt: '', lastHeartbeatAt: '', totalBytes: 0, estimatedDurationSeconds: 0,
    segmentCount: 0, partCount: 0, segments: [], finalizedUploadId: null, errorMessage: null,
    ...over,
  };
}

type Calls = string[];

function fakeApi(calls: Calls, overrides: Partial<RecorderApi> = {}, transportFail?: (call: string) => Error | null) {
  const fail = (call: string) => {
    calls.push(call);
    const e = transportFail?.(call);
    if (e) throw e;
  };
  const api: RecorderApi = {
    transport: {
      openSegment: async (_r, t, i) => fail(`open ${i} [${t}]`),
      putPart: async (_r, t, s, p, body) => { fail(`part ${s}/${p} [${t}] ${body.size}b`); return body.size; },
      closeSegment: async (_r, t, s, n) => fail(`close ${s}=${n} [${t}]`),
      heartbeat: async (_r, t, state) => fail(`hb ${state} [${t}]`),
    },
    createDraftSession: async () => ({ id: 'sess1' }),
    startOrTakeover: vi.fn(async () => ({ recording: recordingState(), recorderToken: 'tok2', nextSegmentIndex: 0 })),
    getRecording: vi.fn(async () => recordingState({ status: 'finalized' })),
    finalizeRecording: vi.fn(async () => ({ status: 'finalizing' as const, jobId: 'j' })),
    discardRecording: vi.fn(async () => undefined),
    getSessionRecording: vi.fn(async () => ({ uploadId: null, recording: null, title: 't', campaignId: 'c' })),
    getSessionProgress: vi.fn(async () => ({ status: 'transcribing', job: null })),
    ...overrides,
  };
  return api;
}

function fakeLocks(): LocksLike & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async request(name, options, cb) {
      if (options.ifAvailable) {
        if (held.has(name)) return cb(null);
        return cb({ name });
      }
      held.add(name);
      await cb({ name });
      held.delete(name);
    },
  };
}

interface Harness {
  engine: RecorderEngine;
  calls: Calls;
  api: RecorderApi;
  store: RecorderStore;
  advance(ms: number): void;
  tickIntervals(): void;
  flush(): Promise<void>;
  recorder(i?: number): FakeRecorder;
  deps: EngineDeps;
}

async function harness(opts: {
  api?: Partial<RecorderApi>;
  transportFail?: (call: string) => Error | null;
  store?: RecorderStore | 'broken';
  locks?: LocksLike;
  deps?: Partial<EngineDeps>;
} = {}): Promise<Harness> {
  FakeRecorder.all = [];
  FakeRecorder.holdStops = false;
  let t = 0;
  const calls: Calls = [];
  const intervals: Array<() => void> = [];
  const api = fakeApi(calls, opts.api, opts.transportFail);
  const store = opts.store === 'broken' ? null : opts.store ?? (await openRecorderStore(new IDBFactory()));
  const macrotask = () => new Promise(r => setTimeout(r, 0));
  const deps: EngineDeps = {
    api,
    openStore: async () => { if (!store) throw new Error('storage blocked'); return store; },
    mediaDevices: {
      getUserMedia: vi.fn(async () => fakeStream('mic-2').stream),
      enumerateDevices: vi.fn(async () => [{ kind: 'audioinput', deviceId: 'mic-1', groupId: 'g', label: 'Mic' }] as MediaDeviceInfo[]),
    },
    MediaRecorder: FakeRecorder,
    AudioContext: null,
    now: () => t,
    wallNow: () => 1_000_000 + t,
    random: () => 0,
    sleep: async ms => { t += ms; await macrotask(); },
    isOnline: () => true,
    waitOnline: () => macrotask() as Promise<void>,
    setInterval: fn => { intervals.push(fn); return intervals.length; },
    clearInterval: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    locks: opts.locks ?? null,
    requestWakeLock: async () => null, // a navigator without Wake Lock
    persistStorage: () => undefined,
    onVisibilityChange: () => () => undefined,
    onDeviceChange: () => () => undefined,
    log: () => undefined,
    ...opts.deps,
  };
  const engine = new RecorderEngine('sess1', deps);
  const flush = async () => { for (let i = 0; i < 8; i++) await macrotask(); };
  return {
    engine, calls, api, store: store as RecorderStore, deps, flush,
    advance: ms => { t += ms; },
    tickIntervals: () => intervals.forEach(fn => fn()),
    recorder: i => FakeRecorder.all[i ?? FakeRecorder.all.length - 1],
  };
}

async function startFresh(h: Harness) {
  await h.engine.start({ stream: fakeStream().stream, userId: 'u1', recordingId: 'rec1', recorderToken: 'tok1', nextSegmentIndex: 0 });
  await h.flush();
}

/** Emit one timeslice after `ms` of active time. */
async function chunk(h: Harness, size = 100, ms = 10_000, i?: number) {
  h.advance(ms);
  h.recorder(i).emit(size);
  await h.flush();
}

// ---------------------------------------------------------------------------

describe('RecorderEngine — capture', () => {
  it('starts: opens segment 0 eagerly, heartbeats, reaches recording without a Wake Lock', async () => {
    const h = await harness();
    await startFresh(h);
    const snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('recording');
    expect(snap.wakeLockActive).toBe(false);
    expect(h.calls).toContain('open 0 [tok1]');
    expect(h.calls).toContain('hb recording [tok1]');
    expect(await h.store.getMeta('rec1')).toMatchObject({ recorderToken: 'tok1', userId: 'u1', sessionId: 'sess1' });
  });

  it('is phase-guarded: a second start is ignored', async () => {
    const h = await harness();
    await startFresh(h);
    await startFresh(h);
    expect(FakeRecorder.all).toHaveLength(1);
  });

  it('buffers chunks in IndexedDB, uploads a sealed part with the token, then deletes the rows', async () => {
    const h = await harness();
    await startFresh(h);
    for (let i = 0; i < 8; i++) await chunk(h); // 80s of 10s timeslices
    expect(await h.store.countPending('rec1')).toBe(8);
    await chunk(h); // 90s → seals part 0
    expect(h.calls).toContain('part 0/0 [tok1] 900b');
    expect(await h.store.countPending('rec1')).toBe(0);
    expect(h.engine.getSnapshot()).toMatchObject({ savedThroughMs: 90_000, pendingParts: 0 });
  });

  it('pause force-seals the open part and reports paused; resume continues the same segment', async () => {
    const h = await harness();
    await startFresh(h);
    await chunk(h);
    h.engine.pause();
    await h.flush();
    expect(h.engine.getSnapshot().phase).toBe('paused');
    expect(h.calls.some(c => c.startsWith('part 0/0'))).toBe(true);
    expect(h.calls).toContain('hb paused [tok1]');
    h.engine.resume();
    await h.flush();
    expect(h.engine.getSnapshot().phase).toBe('recording');
    expect(FakeRecorder.all).toHaveLength(1);
  });

  it('rotates at the hard cap: new run first, old run’s final blob and close land on the old segment', async () => {
    const h = await harness();
    await startFresh(h);
    await chunk(h, 100, 900_000); // hard cap reached → rotate
    await h.flush();
    expect(FakeRecorder.all).toHaveLength(2);
    expect(h.calls).toContain('open 1 [tok1]');
    // Segment 0's first chunk plus the old run's late final blob (7 bytes) form
    // one part on segment 0 — never on segment 1 — and segment 1 opened first.
    expect(h.calls).toContain('part 0/0 [tok1] 107b');
    expect(h.calls).toContain('close 0=1 [tok1]');
    expect(h.calls.indexOf('open 1 [tok1]')).toBeLessThan(h.calls.indexOf('close 0=1 [tok1]'));
    expect(h.engine.getSnapshot().segmentIndex).toBe(1);
  });

  it('mic unplugged: segment ends cleanly, phase stays recording, picking a mic starts a new segment', async () => {
    const h = await harness();
    const { stream, track } = fakeStream();
    await h.engine.start({ stream, userId: 'u1', recordingId: 'rec1', recorderToken: 'tok1', nextSegmentIndex: 0 });
    await h.flush();
    await chunk(h);
    track.end(); // device gone: the recorder stops and flushes its final blob
    await h.flush();
    let snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('recording');
    expect(snap.micLost).toBe(true);
    expect(h.calls).toContain('close 0=1 [tok1]');
    await h.engine.selectDevice('mic-2');
    await h.flush();
    snap = h.engine.getSnapshot();
    expect(snap.micLost).toBe(false);
    expect(h.calls).toContain('open 1 [tok1]');
  });

  it('storage failure: chunks still upload from memory and the snapshot says so', async () => {
    const h = await harness({ store: 'broken' });
    await startFresh(h);
    for (let i = 0; i < 9; i++) await chunk(h);
    expect(h.engine.getSnapshot().storageError).toBe(true);
    expect(h.calls).toContain('part 0/0 [tok1] 900b');
  });
});

describe('RecorderEngine — stop and finalize', () => {
  it('stop flushes the tail, closes, finalizes with the token, and hands off to processing', async () => {
    const h = await harness();
    await startFresh(h);
    await chunk(h);
    await h.engine.stop();
    await h.flush();
    expect(h.calls).toContain('part 0/0 [tok1] 107b'); // 100 + final 7-byte blob
    expect(h.calls).toContain('close 0=1 [tok1]');
    expect(h.api.finalizeRecording).toHaveBeenCalledWith('rec1', { token: 'tok1' });
    const snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('finalized');
    expect(snap.redirectTo).toBe('/sessions/sess1?initialState=processing');
    expect(await h.store.getMeta('rec1')).toBeNull();
  });

  it('nothing captured → finalize-failed offering only Discard', async () => {
    const h = await harness({
      api: { finalizeRecording: vi.fn(async () => { throw new RecorderApiError('nothing-captured', 'none', 400); }) },
    });
    await startFresh(h);
    await h.engine.stop();
    await h.flush();
    const snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('finalize-failed');
    expect(snap.finalize.nothingCaptured).toBe(true);
  });

  it('a failed assembly can be retried', async () => {
    const getRecording = vi.fn()
      .mockResolvedValueOnce(recordingState({ status: 'failed', errorMessage: 'ffmpeg exploded' }))
      .mockResolvedValue(recordingState({ status: 'finalized' }));
    const h = await harness({ api: { getRecording } });
    await startFresh(h);
    await chunk(h);
    await h.engine.stop();
    await h.flush();
    expect(h.engine.getSnapshot()).toMatchObject({ phase: 'finalize-failed', finalize: { errorMessage: 'ffmpeg exploded' } });
    await h.engine.chooseFinalize();
    await h.flush();
    expect(h.engine.getSnapshot().phase).toBe('finalized');
  });
});

describe('RecorderEngine — server verdicts', () => {
  it('taken over (stale token): stops capturing, keeps the local tail, explains', async () => {
    const h = await harness({
      transportFail: call => (call.startsWith('hb') && call.includes('paused') ? new RecorderApiError('stale-token', 'x', 409) : null),
    });
    await startFresh(h);
    await chunk(h);
    h.engine.pause(); // heartbeat 'paused' → 409 stale token
    await h.flush();
    const snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('taken-over');
    expect(snap.takenOverMessage).toMatch(/taken over in another tab/);
    expect(h.recorder().state).toBe('inactive');
  });
});

describe('RecorderEngine — bootstrap and recovery', () => {
  async function seedTail(store: RecorderStore) {
    await store.putMeta({ recordingId: 'rec1', sessionId: 'sess1', userId: 'u1', recorderToken: 'stored', mimeType: 'audio/webm;codecs=opus', createdAt: 1_000_000, updatedAt: 1_000_000 });
    // Segment 1 (server has only segment 0) with parts 0 and 1.
    for (const [seq, partIndex] of [[0, 0], [1, 0], [2, 1]]) {
      await store.putChunk({ recordingId: 'rec1', segmentIndex: 1, seq, partIndex, blob: new Blob([new Uint8Array(10)]), size: 60_000, durationMs: 10_000, mediaEndMs: seq * 10_000, capturedAt: 0 });
    }
  }

  it('a fresh session shows pre-flight (no calls beyond the read)', async () => {
    const h = await harness();
    await h.engine.bootstrap('u1');
    expect(h.engine.getSnapshot().phase).toBe('idle');
    expect(h.api.startOrTakeover).not.toHaveBeenCalled();
  });

  it('is idempotent under concurrent calls (StrictMode)', async () => {
    const h = await harness();
    await Promise.all([h.engine.bootstrap('u1'), h.engine.bootstrap('u1')]);
    expect(h.api.getSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('drains a crash tail with the STORED token (no takeover), then offers the choice', async () => {
    const store = await openRecorderStore(new IDBFactory());
    await seedTail(store);
    const h = await harness({
      store,
      api: {
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'interrupted' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
        getRecording: vi.fn(async () => recordingState({ status: 'interrupted', segments: [{ index: 0, status: 'open', partCount: 3, maxPartIndex: 2, sizeBytes: 30 }] })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    expect(h.calls).toEqual(['open 1 [stored]', 'part 1/0 [stored] 20b', 'part 1/1 [stored] 10b', 'close 1=2 [stored]']);
    expect(h.api.startOrTakeover).not.toHaveBeenCalled();
    const snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('recovery-choice');
    expect(snap.recovery).toMatchObject({ mode: 'tail', drained: { done: 2, total: 2 } });
    expect(await store.countPending('rec1')).toBe(0);
  });

  it('never drains while another tab in this browser holds the recorder lock', async () => {
    const store = await openRecorderStore(new IDBFactory());
    await seedTail(store);
    const locks = fakeLocks();
    locks.held.add('rpg-recorder:rec1');
    const h = await harness({
      store,
      locks,
      api: {
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'recording' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    expect(h.calls).toEqual([]);
    expect(h.engine.getSnapshot().recovery?.mode).toBe('live-elsewhere');
  });

  it('a tail for a recording finalized elsewhere is stranded, reported, and purged', async () => {
    const store = await openRecorderStore(new IDBFactory());
    await seedTail(store);
    const h = await harness({
      store,
      api: {
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'failed' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: 'x' } })),
        getRecording: vi.fn(async () => recordingState({ status: 'failed' })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    const snap = h.engine.getSnapshot();
    expect(snap.recovery?.mode).toBe('failed');
    expect(snap.recovery?.strandedSeconds).toBeGreaterThan(0);
    expect(await store.countPending('rec1')).toBe(0);
  });

  it('Resume after a drain takes over with force (the drain proved ownership) and continues in the next segment', async () => {
    const store = await openRecorderStore(new IDBFactory());
    await seedTail(store);
    const startOrTakeover = vi.fn(async () => ({
      recording: recordingState({ segments: [{ index: 0, status: 'open', partCount: 3, maxPartIndex: 2, sizeBytes: 30 }, { index: 1, status: 'closed', partCount: 2, maxPartIndex: 1, sizeBytes: 30 }] }),
      recorderToken: 'tok2',
      nextSegmentIndex: 2,
    }));
    const h = await harness({
      store,
      api: {
        startOrTakeover,
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'interrupted' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
        getRecording: vi.fn(async () => recordingState({ status: 'interrupted', segments: [{ index: 0, status: 'open', partCount: 3, maxPartIndex: 2, sizeBytes: 30 }] })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    h.engine.chooseResume();
    expect(h.engine.getSnapshot().phase).toBe('preflight');
    await h.engine.start({ stream: fakeStream().stream, userId: 'u1' });
    await h.flush();
    expect(startOrTakeover).toHaveBeenCalledWith('sess1', 'audio/webm;codecs=opus', { force: true });
    expect(h.engine.getSnapshot().phase).toBe('recording');
    expect(h.calls).toContain('open 2 [tok2]');
  });

  it('Resume keeps refused crash-tail audio unresolved: a later Stop parks instead of finalizing and purging it', async () => {
    const store = await openRecorderStore(new IDBFactory());
    await seedTail(store);
    const h = await harness({
      store,
      transportFail: call => (call.startsWith('part 1/0') ? new RecorderApiError('client-bug', 'nope', 400) : null),
      api: {
        startOrTakeover: vi.fn(async () => ({
          recording: recordingState({ segments: [
            { index: 0, status: 'open', partCount: 3, maxPartIndex: 2, sizeBytes: 30 },
            { index: 1, status: 'open', partCount: 1, maxPartIndex: 1, sizeBytes: 10 },
          ] }),
          recorderToken: 'tok2',
          nextSegmentIndex: 2,
        })),
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'interrupted' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
        getRecording: vi.fn(async () => recordingState({ status: 'interrupted', segments: [{ index: 0, status: 'open', partCount: 3, maxPartIndex: 2, sizeBytes: 30 }] })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    expect(h.engine.getSnapshot().recovery?.unresolvedSeconds).toBeGreaterThan(0);
    // The drain never closed segment 1 over its refused part.
    expect(h.calls.some(c => c.startsWith('close 1='))).toBe(false);

    h.engine.chooseResume();
    await h.engine.start({ stream: fakeStream().stream, userId: 'u1' });
    await h.flush();
    let snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('recording');
    expect(snap.unresolved).toMatchObject({ parts: 1 });

    for (let i = 0; i < 3; i++) await chunk(h);
    await h.engine.stop();
    await h.flush();
    snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('tail-blocked');
    expect(h.api.finalizeRecording).not.toHaveBeenCalled();
    expect(await store.countPending('rec1')).toBeGreaterThan(0); // the refused part is still held
  });

  it('an assembly already running is polled to completion', async () => {
    const h = await harness({
      api: {
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'finalizing' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    expect(h.engine.getSnapshot()).toMatchObject({ phase: 'finalized', redirectTo: '/sessions/sess1?initialState=processing' });
  });

  it('discard from recovery deletes server + local and returns to the session', async () => {
    const h = await harness({
      api: {
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'interrupted' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
        getRecording: vi.fn(async () => recordingState({ status: 'interrupted' })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    await h.engine.chooseDiscard();
    expect(h.api.discardRecording).toHaveBeenCalledWith('rec1', { token: null, force: false });
    expect(h.engine.getSnapshot()).toMatchObject({ phase: 'discarded', redirectTo: '/sessions/sess1' });
  });
});

// ---------------------------------------------------------------------------
// PR #50 review regressions
// ---------------------------------------------------------------------------

describe('RecorderEngine — review regressions', () => {
  it('Stop joins a rotated run whose final blob arrives late: no finalize before the old tail', async () => {
    const h = await harness({
      // The stop-join timeout must not win the race in this test.
      deps: { sleep: async ms => { if (ms >= 15_000) return new Promise(() => undefined); await new Promise(r => setTimeout(r, 0)); } },
    });
    await startFresh(h);
    await chunk(h);
    FakeRecorder.holdStops = true;
    await chunk(h, 100, 900_000); // rotate: old run's final blob is held
    expect(FakeRecorder.all).toHaveLength(2);
    const stopping = h.engine.stop();
    await h.flush();
    // Both runs stopped, but the OLD one's tail hasn't arrived: no finalize yet.
    expect(h.api.finalizeRecording).not.toHaveBeenCalled();
    FakeRecorder.all.forEach(r => r.release());
    await stopping;
    await h.flush();
    expect(h.calls).toContain('close 0=1 [tok1]');
    const closeIdx = h.calls.indexOf('close 0=1 [tok1]');
    expect(closeIdx).toBeGreaterThan(-1);
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);
    // Segment 0's late 7-byte blob was part of what got uploaded before finalize.
    expect(h.calls.some(c => c.startsWith('part 0/'))).toBe(true);
  });

  it('a stalled recorder stop is NOT a completed stop: after the timeout Stop keeps waiting, never finalizes', async () => {
    // The default harness sleep resolves at once, so the 15 s join timeout fires.
    const h = await harness();
    await startFresh(h);
    await chunk(h);
    FakeRecorder.holdStops = true;
    await chunk(h, 100, 900_000); // rotate: the old run's final blob is held
    const stopping = h.engine.stop();
    await h.flush();
    let snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('stopping');
    expect(snap.stopStalled).toBe(true);
    expect(h.api.finalizeRecording).not.toHaveBeenCalled();

    FakeRecorder.all.forEach(r => r.release()); // the late blob finally arrives
    await stopping;
    await h.flush();
    snap = h.engine.getSnapshot();
    expect(snap.stopStalled).toBe(false);
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);
    // Segment 0's late 7-byte blob is in what was uploaded before finalize.
    expect(h.calls).toContain('part 0/0 [tok1] 207b');
    expect(h.calls).toContain('close 0=1 [tok1]');
  });

  it('giving up on a stalled stop is explicit: segments finish with what arrived, late audio is ignored', async () => {
    const h = await harness();
    await startFresh(h);
    await chunk(h);
    FakeRecorder.holdStops = true;
    await chunk(h, 100, 900_000);
    const stopping = h.engine.stop();
    await h.flush();
    h.engine.abandonTailAndFinalize(); // wrong phase for this: ignored
    expect(h.engine.getSnapshot().phase).toBe('stopping');

    h.engine.abandonStalledStop();
    await stopping;
    await h.flush();
    expect(h.calls).toContain('part 0/0 [tok1] 200b');
    expect(h.calls).toContain('close 0=1 [tok1]');
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);

    const before = h.calls.length;
    FakeRecorder.all.forEach(r => r.release()); // too late: the user gave it up
    await h.flush();
    expect(h.calls.slice(before).filter(c => c.startsWith('part') || c.startsWith('close'))).toEqual([]);
  });

  it('a synchronous IndexedDB throw falls back to memory and still uploads', async () => {
    const real = await openRecorderStore(new IDBFactory());
    const throwing: RecorderStore = {
      ...real,
      putChunk: () => { throw new DOMException('connection closed', 'InvalidStateError'); },
    };
    const h = await harness({ store: throwing });
    await startFresh(h);
    for (let i = 0; i < 9; i++) await chunk(h);
    expect(h.engine.getSnapshot().storageError).toBe(true);
    expect(h.calls).toContain('part 0/0 [tok1] 900b');
  });

  it('splits an oversized delayed blob into bounded parts, in order', async () => {
    const h = await harness();
    await startFresh(h);
    const MiB = 1024 * 1024;
    await chunk(h, 7 * MiB, 10_000); // e.g. one blob after a long screen lock
    await h.engine.stop();
    await h.flush();
    const parts = h.calls.filter(c => c.startsWith('part 0/'));
    const sizes = parts.map(c => Number(c.match(/ (\d+)b$/)![1]));
    expect(Math.max(...sizes)).toBeLessThan(6 * MiB); // < 2 × PART_MAX_BYTES, under the 8 MiB server cap
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(7 * MiB + 7);
    expect(parts.map(c => Number(c.match(/part 0\/(\d+)/)![1]))).toEqual(sizes.map((_, i) => i));
  });

  it('bootstrapping an orphaned "finalizing" recording re-posts finalize (no endless poll)', async () => {
    const getRecording = vi.fn()
      .mockResolvedValueOnce(recordingState({ status: 'finalizing' }))
      .mockResolvedValue(recordingState({ status: 'finalized' }));
    const h = await harness({
      api: {
        getRecording,
        getSessionRecording: vi.fn(async () => ({ uploadId: null, title: 't', campaignId: 'c', recording: { id: 'rec1', status: 'finalizing' as const, estimatedDurationSeconds: 60, startedAt: '', lastHeartbeatAt: '', errorMessage: null } })),
      },
    });
    await h.engine.bootstrap('u1');
    await h.flush();
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);
    expect(h.engine.getSnapshot().phase).toBe('finalized');
  });

  it('a mic switch that resolves after Stop releases the new microphone', async () => {
    let resolveGum!: (s: MediaStream) => void;
    const late = fakeStream('mic-2');
    const h = await harness({
      deps: {
        mediaDevices: {
          getUserMedia: vi.fn(() => new Promise<MediaStream>(r => { resolveGum = r; })),
          enumerateDevices: vi.fn(async () => [] as MediaDeviceInfo[]),
        },
      },
    });
    await startFresh(h);
    const switching = h.engine.selectDevice('mic-2');
    await h.engine.stop();
    resolveGum(late.stream);
    await switching;
    await h.flush();
    expect(late.track.stop).toHaveBeenCalled();
    expect(FakeRecorder.all).toHaveLength(1); // no new segment on a stopped engine
  });

  it('a refused part freezes "saved through", keeps health degraded, and blocks finalize until resolved', async () => {
    let refuse = true;
    const h = await harness({
      transportFail: call => (refuse && call.startsWith('part 0/0') ? new RecorderApiError('client-bug', 'Part exceeds maximum size', 413) : null),
    });
    await startFresh(h);
    for (let i = 0; i < 18; i++) await chunk(h); // parts 0 (refused) and 1 (accepted)
    let snap = h.engine.getSnapshot();
    expect(h.calls).toContain('part 0/1 [tok1] 900b');
    expect(snap.uploadHealth).toBe('degraded');
    expect(snap.savedThroughMs).toBe(0); // frozen at the refused part's start
    expect(snap.unresolved).toMatchObject({ parts: 1 });

    await h.engine.stop();
    await h.flush();
    snap = h.engine.getSnapshot();
    expect(snap.phase).toBe('tail-blocked');
    expect(h.api.finalizeRecording).not.toHaveBeenCalled();

    refuse = false; // e.g. transient server bug fixed
    await h.engine.retryTail();
    await h.flush();
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);
    expect(h.engine.getSnapshot().phase).toBe('finalized');
  });

  it('finalizing across a refused part requires the explicit accept-loss action', async () => {
    const h = await harness({
      transportFail: call => (call.startsWith('part 0/0') ? new RecorderApiError('client-bug', 'nope', 400) : null),
    });
    await startFresh(h);
    for (let i = 0; i < 9; i++) await chunk(h);
    await h.engine.stop();
    await h.flush();
    expect(h.engine.getSnapshot().phase).toBe('tail-blocked');
    await h.engine.finalizeAcceptingLoss();
    await h.flush();
    expect(h.api.finalizeRecording).toHaveBeenCalledTimes(1);
    expect(h.engine.getSnapshot().phase).toBe('finalized');
  });
});
