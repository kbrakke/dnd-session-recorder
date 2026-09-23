import { describe, expect, it, vi } from 'vitest';
import { RecorderApiError } from '../api';
import type { RecorderTransport } from '../api';
import { QueueStoppedError, UploadQueue } from '../upload-queue';
import type { QueueDeps, QueueEvents } from '../upload-queue';
import type { SealedPart, UploadJob } from '../types';

const part = (segmentIndex: number, partIndex: number, mediaEndMs = (partIndex + 1) * 1000): SealedPart => ({
  segmentIndex, partIndex, firstSeq: partIndex, lastSeq: partIndex, size: 3, durationMs: 1000, mediaEndMs,
});
const partJob = (s: number, p: number): UploadJob => ({ kind: 'part', ...part(s, p) });

function harness(opts: { failures?: Array<(call: string) => RecorderApiError | null>; online?: () => boolean } = {}) {
  const calls: string[] = [];
  const failures = [...(opts.failures ?? [])];
  const stored = new Map<string, SealedPart>();
  const acked: string[] = [];
  const delays: number[] = [];

  const maybeFail = (call: string) => {
    calls.push(call);
    const next = failures[0];
    if (next) {
      const err = next(call);
      if (err) {
        failures.shift();
        throw err;
      }
    }
  };
  const transport: RecorderTransport = {
    openSegment: async (_r, _t, i) => maybeFail(`open ${i}`),
    putPart: async (_r, _t, s, p) => { maybeFail(`part ${s}/${p}`); return 3; },
    closeSegment: async (_r, _t, s, n) => maybeFail(`close ${s}=${n}`),
    heartbeat: async () => undefined,
  };
  const deps: QueueDeps = {
    transport,
    mimeType: 'audio/webm',
    parts: {
      read: async (s, p) => (stored.has(`${s}/${p}`) ? [new Blob([new Uint8Array([1, 2, 3])])] : []),
      ack: async (s, p) => { stored.delete(`${s}/${p}`); acked.push(`${s}/${p}`); },
      lookup: async (s, p) => stored.get(`${s}/${p}`) ?? null,
    },
    now: () => 42,
    random: () => 0,
    // Real timers yield a macrotask; fakes must too, or an offline loop
    // spins on microtasks forever.
    sleep: async ms => { delays.push(ms); await new Promise(r => setTimeout(r, 0)); },
    isOnline: opts.online ?? (() => true),
    waitOnline: () => new Promise(r => setTimeout(r, 0)),
  };
  const events: Required<QueueEvents> = {
    onPartAcked: vi.fn(), onSegmentOpened: vi.fn(), onSegmentClosed: vi.fn(), onPartsMissing: vi.fn(),
    onPartsAbandoned: vi.fn(), onHealth: vi.fn(), onFatal: vi.fn(), onRejected: vi.fn(),
  };
  const store = (s: number, p: number) => stored.set(`${s}/${p}`, part(s, p));
  const queue = new UploadQueue('r1', 'tok', deps, events);
  return { queue, calls, acked, delays, events, store, stored };
}

const err = (kind: ConstructorParameters<typeof RecorderApiError>[0], extra = {}) =>
  new RecorderApiError(kind, kind, 409, extra);
const once = (match: string, e: RecorderApiError) => (call: string) => (call === match ? e : null);

describe('UploadQueue', () => {
  it('runs jobs FIFO, acks parts in order, and resolves drained()', async () => {
    const h = harness();
    h.store(0, 0); h.store(0, 1);
    h.queue.enqueue({ kind: 'open', segmentIndex: 0 });
    h.queue.enqueue(partJob(0, 0));
    h.queue.enqueue(partJob(0, 1));
    h.queue.enqueue({ kind: 'close', segmentIndex: 0, partCount: 2 });
    await h.queue.drained();
    expect(h.calls).toEqual(['open 0', 'part 0/0', 'part 0/1', 'close 0=2']);
    expect(h.acked).toEqual(['0/0', '0/1']);
    expect((h.events.onPartAcked as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].partIndex)).toEqual([0, 1]);
    expect(h.events.onSegmentClosed).toHaveBeenCalledWith(0);
    expect(h.queue.state).toBe('idle');
  });

  it('retries the head in place with backoff; later jobs wait (head-of-line)', async () => {
    const net = new RecorderApiError('network', 'down', null);
    const h = harness({ failures: [once('part 0/0', net), once('part 0/0', net)] });
    h.store(0, 0); h.store(0, 1);
    h.queue.enqueue(partJob(0, 0));
    h.queue.enqueue(partJob(0, 1));
    await h.queue.drained();
    expect(h.calls).toEqual(['part 0/0', 'part 0/0', 'part 0/0', 'part 0/1']);
    expect(h.delays).toEqual([500, 1000]);
  });

  it('honors Retry-After over computed backoff', async () => {
    const h = harness({ failures: [once('part 0/0', new RecorderApiError('rate-limited', 'slow', 429, { retryAfterMs: 7000 }))] });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    await h.queue.drained();
    expect(h.delays).toEqual([7000]);
  });

  it('never deletes local rows when an upload fails', async () => {
    const h = harness({ failures: [once('part 0/0', err('stale-token'))] });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    await expect(h.queue.drained()).rejects.toMatchObject({ kind: 'stale-token' });
    expect(h.stored.has('0/0')).toBe(true);
    expect(h.acked).toEqual([]);
  });

  it('stale token is terminal: stops, reports, ignores later enqueues', async () => {
    const h = harness({ failures: [once('open 0', err('stale-token'))] });
    h.queue.enqueue({ kind: 'open', segmentIndex: 0 });
    await expect(h.queue.drained()).rejects.toBeInstanceOf(RecorderApiError);
    expect(h.events.onFatal).toHaveBeenCalledWith('stale-token', 'stale-token');
    expect(h.queue.state).toBe('stopped');
    h.queue.enqueue({ kind: 'open', segmentIndex: 1 });
    expect(h.queue.snapshotJobs()).toHaveLength(1);
  });

  it('segment_not_found re-opens the segment at the head, then retries', async () => {
    const h = harness({ failures: [once('part 3/0', err('segment-not-found'))] });
    h.store(3, 0);
    h.queue.enqueue(partJob(3, 0));
    await h.queue.drained();
    expect(h.calls).toEqual(['part 3/0', 'open 3', 'part 3/0']);
  });

  it('segment_closed on a part is an ACK', async () => {
    const h = harness({ failures: [once('part 0/4', err('segment-closed'))] });
    h.store(0, 4);
    h.queue.enqueue(partJob(0, 4));
    await h.queue.drained();
    expect(h.acked).toEqual(['0/4']);
    expect(h.events.onPartAcked).toHaveBeenCalled();
  });

  it('parts_missing: re-uploads locally held parts and re-closes; then falls back to the prefix', async () => {
    const h = harness({
      failures: [
        once('close 0=4', err('parts-missing', { missing: [1, 2] })),
        once('close 0=4', err('parts-missing', { missing: [2] })),
      ],
    });
    h.store(0, 1); // part 2 is gone locally
    h.queue.enqueue({ kind: 'close', segmentIndex: 0, partCount: 4 });
    await h.queue.drained();
    expect(h.calls).toEqual(['close 0=4', 'part 0/1', 'close 0=4', 'close 0=2']);
    expect(h.events.onPartsMissing).toHaveBeenCalledWith(0, [1, 2]);
    expect(h.events.onPartsAbandoned).toHaveBeenCalledWith(0, [2]);
  });

  it('parts_missing with part 0 gone skips the close entirely', async () => {
    const h = harness({
      failures: [once('close 1=2', err('parts-missing', { missing: [0] })), once('close 1=2', err('parts-missing', { missing: [0] }))],
    });
    h.queue.enqueue({ kind: 'close', segmentIndex: 1, partCount: 2 });
    await h.queue.drained();
    expect(h.calls).toEqual(['close 1=2', 'close 1=2']);
  });

  it('client bugs are dropped (never retried) and reported, rows kept', async () => {
    const h = harness({ failures: [once('part 0/0', new RecorderApiError('client-bug', 'Empty part', 400))] });
    h.store(0, 0); h.store(0, 1);
    h.queue.enqueue(partJob(0, 0));
    h.queue.enqueue(partJob(0, 1));
    await h.queue.drained();
    expect(h.calls).toEqual(['part 0/0', 'part 0/1']);
    expect(h.events.onRejected).toHaveBeenCalled();
    expect(h.stored.has('0/0')).toBe(true);
  });

  it('a part with no local bytes is rejected, not reported as saved', async () => {
    const h = harness();
    h.queue.enqueue(partJob(0, 0));
    await h.queue.drained();
    expect(h.calls).toEqual([]);
    expect(h.events.onPartAcked).not.toHaveBeenCalled();
    expect(h.events.onRejected).toHaveBeenCalled();
  });

  it('auth errors keep retrying and report auth-expired', async () => {
    const h = harness({ failures: [once('part 0/0', new RecorderApiError('auth', 'signed out', 401))] });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    await h.queue.drained();
    expect(h.events.onHealth).toHaveBeenCalledWith('auth-expired', 'signed out');
    expect(h.acked).toEqual(['0/0']);
  });

  it('waits for online instead of spinning, reporting offline', async () => {
    let online = false;
    const h = harness({ online: () => online });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(h.events.onHealth).toHaveBeenCalledWith('offline', null);
    online = true;
    await h.queue.drained();
    expect(h.acked).toEqual(['0/0']);
  });

  it('degrades health after repeated failures and recovers on success', async () => {
    const net = new RecorderApiError('network', 'down', null);
    const h = harness({ failures: [once('part 0/0', net), once('part 0/0', net), once('part 0/0', net)] });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    await h.queue.drained();
    const healths = (h.events.onHealth as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(healths).toContain('degraded');
    expect(healths[healths.length - 1]).toBe('ok');
  });

  it('stop() rejects waiters with QueueStoppedError', async () => {
    const h = harness({ online: () => false });
    h.store(0, 0);
    h.queue.enqueue(partJob(0, 0));
    const waiting = h.queue.drained();
    h.queue.stop();
    await expect(waiting).rejects.toBeInstanceOf(QueueStoppedError);
  });

  it('reports the remaining backlog (excluding the acked part) when a part is acked', async () => {
    const h = harness();
    h.store(0, 0); h.store(0, 1);
    const seen: number[] = [];
    (h.events.onPartAcked as ReturnType<typeof vi.fn>).mockImplementation(() => seen.push(h.queue.pendingParts()));
    h.queue.enqueue(partJob(0, 0));
    h.queue.enqueue(partJob(0, 1));
    await h.queue.drained();
    expect(seen).toEqual([1, 0]);
  });

  it('counts pending parts', () => {
    const h = harness({ online: () => false });
    h.queue.enqueue({ kind: 'open', segmentIndex: 0 });
    h.queue.enqueue(partJob(0, 0));
    h.queue.enqueue(partJob(0, 1));
    expect(h.queue.pendingParts()).toBe(2);
    h.queue.stop();
  });
});
