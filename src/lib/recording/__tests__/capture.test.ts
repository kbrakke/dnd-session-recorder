import { describe, expect, it, vi } from 'vitest';
import {
  MicError,
  acquireMicStream,
  createLevelMeter,
  createSegmentRun,
  listAudioInputs,
  resolveDeviceId,
  toMicError,
} from '../capture';
import type { MediaRecorderLike, StopReason } from '../capture';

class FakeRecorder implements MediaRecorderLike {
  static instances: FakeRecorder[] = [];
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
    FakeRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  requestData() { this.emit(0); }
  stop() {
    this.state = 'inactive';
    // Spec order, asynchronously: final dataavailable, then stop.
    queueMicrotask(() => { this.emit(4); this.onstop?.(new Event('stop')); });
  }
  emit(size: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) }); }
  /** The device went away: the recorder stops on its own. */
  die() { this.state = 'inactive'; this.onstop?.(new Event('stop')); }
}

const stream = {} as MediaStream;

function run(segmentIndex: number) {
  const chunks: Array<[number, number]> = [];
  const stops: StopReason[] = [];
  const r = createSegmentRun({
    stream,
    segmentIndex,
    now: () => 7,
    MediaRecorder: FakeRecorder,
    handlers: {
      onChunk: blob => chunks.push([segmentIndex, blob.size]),
      onStopped: reason => stops.push(reason),
      onError: () => undefined,
    },
  });
  return { r, chunks, stops, rec: FakeRecorder.instances[FakeRecorder.instances.length - 1] };
}

describe('createSegmentRun', () => {
  it('records opus at 48kbps', () => {
    const { rec } = run(0);
    expect(rec.options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48_000 });
  });

  it('binds chunks to its own segment, including the final blob after a rotation', async () => {
    const old = run(0);
    old.r.start(1000);
    old.rec.emit(10);
    const next = run(1);
    next.r.start(1000); // new run starts first, then the old one stops
    const done = old.r.stop('rotate');
    next.rec.emit(20);
    await done;
    expect(old.chunks).toEqual([[0, 10], [0, 4]]);
    expect(next.chunks).toEqual([[1, 20]]);
    expect(old.stops).toEqual(['rotate']);
  });

  it('drops empty blobs', () => {
    const { r, rec, chunks } = run(0);
    r.start(1000);
    r.requestData(); // emits size 0
    rec.emit(0);
    expect(chunks).toEqual([]);
  });

  it('an unrequested stop reports device-lost', () => {
    const { r, rec, stops } = run(0);
    r.start(1000);
    rec.die();
    expect(stops).toEqual(['device-lost']);
  });

  it('stop resolves immediately for a run that never started or already ended', async () => {
    const never = run(0);
    await never.r.stop('user-stop');
    const dead = run(1);
    dead.r.start(1000);
    dead.rec.die();
    await dead.r.stop('user-stop');
    expect(dead.stops).toEqual(['device-lost']);
  });

  it('guards pause/resume by state', () => {
    const { r, rec } = run(0);
    r.pause(); // inactive: no-op
    expect(rec.state).toBe('inactive');
    r.start(1000);
    r.pause();
    r.pause();
    expect(rec.state).toBe('paused');
    r.resume();
    expect(rec.state).toBe('recording');
  });
});

describe('microphone helpers', () => {
  const track = (settings: MediaTrackSettings) => ({ getAudioTracks: () => [{ getSettings: () => settings }] }) as unknown as MediaStream;

  it('maps DOMException names to distinct errors', () => {
    expect(toMicError(new DOMException('x', 'NotAllowedError')).kind).toBe('denied');
    expect(toMicError(new DOMException('x', 'NotReadableError')).kind).toBe('busy');
    expect(toMicError(new DOMException('x', 'NotFoundError')).kind).toBe('not-found');
    expect(toMicError(new Error('weird')).kind).toBe('unknown');
  });

  it('asks for mono without call processing and the exact device', async () => {
    const getUserMedia = vi.fn(async () => track({ deviceId: 'mic-2', channelCount: 1 }));
    const res = await acquireMicStream({ getUserMedia, enumerateDevices: vi.fn() }, 'mic-2');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: { ideal: 1 }, deviceId: { exact: 'mic-2' } },
    });
    expect(res).toMatchObject({ fellBack: false, deviceId: 'mic-2', channelCount: 1 });
  });

  it('falls back to the default device when the chosen one is gone', async () => {
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException('gone', 'OverconstrainedError'))
      .mockResolvedValueOnce(track({ deviceId: 'default' }));
    const res = await acquireMicStream({ getUserMedia, enumerateDevices: vi.fn() }, 'unplugged');
    expect(res.fellBack).toBe(true);
    expect(getUserMedia.mock.calls[1][0].audio).not.toHaveProperty('deviceId');
  });

  it('does not retry a denial', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    await expect(acquireMicStream({ getUserMedia, enumerateDevices: vi.fn() }, 'x')).rejects.toBeInstanceOf(MicError);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('lists audio inputs with ids, labelling blanks', async () => {
    const enumerateDevices = vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'default', groupId: 'g', label: 'Default - USB Mic' },
      { kind: 'audioinput', deviceId: 'b', groupId: 'g2', label: '' },
      { kind: 'audioinput', deviceId: '', groupId: '', label: '' },
      { kind: 'videoinput', deviceId: 'cam', groupId: '', label: 'Cam' },
    ] as MediaDeviceInfo[]);
    const list = await listAudioInputs({ getUserMedia: vi.fn(), enumerateDevices });
    expect(list.map(d => d.label)).toEqual(['Default - USB Mic', 'Microphone 2']);
  });

  it('only resolves a device id that is currently present', () => {
    const devices = [{ deviceId: 'a', groupId: '', label: 'A' }];
    expect(resolveDeviceId('a', devices)).toBe('a');
    expect(resolveDeviceId('stale-hint', devices)).toBeNull();
    expect(resolveDeviceId('', devices)).toBeNull();
  });
});

describe('createLevelMeter', () => {
  function fakeContext(state: AudioContextState, samples: number[]) {
    const stop = vi.fn();
    const ctx = class {
      state = state;
      createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
      createAnalyser() {
        return { fftSize: 0, getFloatTimeDomainData: (buf: Float32Array) => buf.set(samples.slice(0, buf.length)) };
      }
      close = vi.fn(async () => { this.state = 'closed'; });
      resume = vi.fn();
    };
    return { ctx, stop };
  }

  it('computes RMS while running', () => {
    const { ctx } = fakeContext('running', new Array(2048).fill(0.5));
    const meter = createLevelMeter({} as MediaStream, ctx as never);
    expect(meter.readRms()).toBeCloseTo(0.5);
  });

  it('reports unknown (null) while suspended', () => {
    const { ctx } = fakeContext('suspended', []);
    expect(createLevelMeter({} as MediaStream, ctx as never).readRms()).toBeNull();
  });

  it('dispose closes the context without touching tracks', async () => {
    const { ctx } = fakeContext('running', []);
    const tracks = { getTracks: vi.fn() } as unknown as MediaStream;
    await createLevelMeter(tracks, ctx as never).dispose();
    expect(tracks.getTracks).not.toHaveBeenCalled();
  });
});
