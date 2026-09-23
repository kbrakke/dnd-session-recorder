import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/database', () => ({ db: {} }));
vi.mock('@/services/storage', () => ({
  buildAudioKey: vi.fn(),
  buildRecordingPartKey: vi.fn(),
  saveAudio: vi.fn(),
  downloadObjectToFile: vi.fn(),
  deleteObjectByKey: vi.fn(),
}));
vi.mock('@/services/pipeline/queue', () => ({ getLatestJob: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { canStreamCopyConcat } from '../finalizeRecording';

const opus = (channels: number, sampleRate = 48000) => ({ codec: 'opus', channels, sampleRate });

describe('canStreamCopyConcat', () => {
  it('stream-copies identical segments', () => {
    expect(canStreamCopyConcat([opus(1), opus(1), opus(1)])).toBe(true);
  });

  it('re-encodes when a mic swap changed the channel count', () => {
    expect(canStreamCopyConcat([opus(1), opus(2)])).toBe(false);
  });

  it('re-encodes when the sample rate differs', () => {
    expect(canStreamCopyConcat([opus(1, 48000), opus(1, 44100)])).toBe(false);
  });

  it('re-encodes when a segment could not be probed', () => {
    expect(canStreamCopyConcat([{ codec: null, channels: null, sampleRate: null }, opus(1)])).toBe(false);
  });

  it('treats a single segment as copyable', () => {
    expect(canStreamCopyConcat([opus(2)])).toBe(true);
  });
});
