import { describe, expect, it, vi } from 'vitest';
import { RecorderApiError } from '../api';
import { Heartbeat } from '../heartbeat';

function harness() {
  let t = 0;
  const sent: Array<'recording' | 'paused'> = [];
  let pending: Array<{ resolve(): void; reject(e: unknown): void }> = [];
  let manual = false;
  let tick: (() => void) | null = null;
  const transport = {
    heartbeat: vi.fn(async (_r: string, _t: string, state: 'recording' | 'paused') => {
      sent.push(state);
      if (manual) await new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    }),
  };
  const events = { onFatal: vi.fn(), onAuthError: vi.fn(), onSent: vi.fn() };
  const hb = new Heartbeat('r1', 'tok', {
    transport,
    now: () => t,
    setInterval: fn => { tick = fn; return 1; },
    clearInterval: () => { tick = null; },
  }, events, 15_000, 5_000);
  const flush = () => new Promise(r => setTimeout(r, 0));
  return {
    hb, sent, events, transport, flush,
    advance: (ms: number) => { t += ms; },
    tick: () => tick?.(),
    hold: () => { manual = true; },
    release: () => { const p = pending; pending = []; p.forEach(x => x.resolve()); },
    fail: (e: unknown) => { const p = pending; pending = []; p.forEach(x => x.reject(e)); },
  };
}

describe('Heartbeat', () => {
  it('announces on start, then sends only every interval', async () => {
    const h = harness();
    h.hb.start(() => 'recording');
    await h.flush();
    expect(h.sent).toEqual(['recording']);
    h.advance(10_000); h.tick(); await h.flush();
    expect(h.sent).toHaveLength(1);
    h.advance(5_000); h.tick(); await h.flush();
    expect(h.sent).toHaveLength(2);
  });

  it('a part ACK counts as a beat (noteImplicit)', async () => {
    const h = harness();
    h.hb.start(() => 'recording');
    await h.flush();
    h.advance(14_000);
    h.hb.noteImplicit(14_000);
    h.advance(10_000); h.tick(); await h.flush();
    expect(h.sent).toHaveLength(1);
  });

  it('keeps at most one request in flight and sends the latest state after it settles', async () => {
    const h = harness();
    h.hold();
    let state: 'recording' | 'paused' = 'recording';
    h.hb.start(() => state);
    await h.flush();
    state = 'paused';
    h.hb.markDirty(); // pause while the first beat is in flight
    await h.flush();
    expect(h.sent).toEqual(['recording']);
    h.release(); await h.flush();
    expect(h.sent).toEqual(['recording', 'paused']);
  });

  it('stale token is terminal for the current generation', async () => {
    const h = harness();
    h.hold();
    h.hb.start(() => 'recording');
    await h.flush();
    h.fail(new RecorderApiError('stale-token', 'taken over', 409));
    await h.flush();
    expect(h.events.onFatal).toHaveBeenCalledWith('stale-token', 'taken over');
    expect(h.hb.isRunning).toBe(false);
  });

  it('ignores a verdict for a request from before stop() (e.g. racing the user Stop)', async () => {
    const h = harness();
    h.hold();
    h.hb.start(() => 'recording');
    await h.flush();
    h.hb.stop();
    h.fail(new RecorderApiError('not-capturing', 'finalizing', 409));
    await h.flush();
    expect(h.events.onFatal).not.toHaveBeenCalled();
  });

  it('swallows network errors and reports auth errors', async () => {
    const h = harness();
    h.hold();
    h.hb.start(() => 'recording');
    await h.flush();
    h.fail(new RecorderApiError('auth', 'signed out', 401));
    await h.flush();
    expect(h.events.onAuthError).toHaveBeenCalledWith('signed out');
    expect(h.hb.isRunning).toBe(true);
  });

  it('stop clears the tick', async () => {
    const h = harness();
    h.hb.start(() => 'recording');
    await h.flush();
    h.hb.stop();
    h.advance(60_000); h.tick(); await h.flush();
    expect(h.sent).toHaveLength(1);
  });
});
