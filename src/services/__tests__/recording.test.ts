import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Pure-logic tests only; the service's prisma/storage touchpoints are
// covered by route-level and staging tests. Mock the heavy imports so the
// module loads without a database or storage backend.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/storage', () => ({
  buildRecordingPartKey: vi.fn(),
  deleteObjectByKey: vi.fn(),
  saveAudio: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  RECORDING_STALE_SECONDS,
  baseMimeType,
  contiguousParts,
  deriveDisplayStatus,
  estimateDurationSeconds,
  extensionForMime,
} from '@/services/recording';
import { buildRecordingPartKey } from '@/services/storage';

describe('baseMimeType', () => {
  it('strips codec parameters and normalizes case', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMimeType('Audio/MP4; codecs="mp4a.40.2"')).toBe('audio/mp4');
    expect(baseMimeType('audio/webm')).toBe('audio/webm');
  });
});

describe('extensionForMime', () => {
  it('maps recorder mime types to pipeline-friendly extensions', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('.webm');
    expect(extensionForMime('audio/mp4')).toBe('.m4a');
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('.ogg');
    expect(extensionForMime('audio/unknown-thing')).toBe('.webm');
  });
});

describe('estimateDurationSeconds', () => {
  it('estimates from the 48kbps recording bitrate', () => {
    // 1 hour at 48kbps = 21.6 MB
    expect(estimateDurationSeconds(21_600_000)).toBe(3600);
    expect(estimateDurationSeconds(0)).toBe(0);
  });
});

describe('deriveDisplayStatus', () => {
  const now = 1_000_000_000_000;
  const fresh = new Date(now - 10_000);
  const stale = new Date(now - (RECORDING_STALE_SECONDS + 1) * 1000);

  it('derives interrupted from a stale heartbeat while capturing', () => {
    expect(deriveDisplayStatus('recording', stale, now)).toBe('interrupted');
    expect(deriveDisplayStatus('paused', stale, now)).toBe('interrupted');
  });

  it('keeps live statuses while the heartbeat is fresh', () => {
    expect(deriveDisplayStatus('recording', fresh, now)).toBe('recording');
    expect(deriveDisplayStatus('paused', fresh, now)).toBe('paused');
  });

  it('never marks terminal states interrupted, however old', () => {
    expect(deriveDisplayStatus('finalizing', stale, now)).toBe('finalizing');
    expect(deriveDisplayStatus('finalized', stale, now)).toBe('finalized');
    expect(deriveDisplayStatus('failed', stale, now)).toBe('failed');
  });
});

describe('contiguousParts', () => {
  it('returns everything when indexes are gapless (any input order)', () => {
    const parts = [{ index: 2 }, { index: 0 }, { index: 1 }];
    expect(contiguousParts(parts).map(p => p.index)).toEqual([0, 1, 2]);
  });

  it('stops at the first gap — audio past a lost part is unusable', () => {
    const parts = [{ index: 0 }, { index: 1 }, { index: 3 }, { index: 4 }];
    expect(contiguousParts(parts).map(p => p.index)).toEqual([0, 1]);
  });

  it('returns nothing when part 0 is missing', () => {
    expect(contiguousParts([{ index: 1 }, { index: 2 }])).toEqual([]);
  });

  it('handles the empty segment', () => {
    expect(contiguousParts([])).toEqual([]);
  });
});

describe('buildRecordingPartKey (real module)', () => {
  it('builds the recording-prefixed key', async () => {
    const storage = await vi.importActual<typeof import('@/services/storage')>(
      '@/services/storage'
    );
    expect(storage.buildRecordingPartKey('user1', 'rec1', 2, 41)).toBe(
      'recording/user1/rec1/2/41.part'
    );
    expect(buildRecordingPartKey).toBeDefined(); // mocked elsewhere in this suite
  });
});
