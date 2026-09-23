import { beforeEach, describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Pure logic plus the conditional-transition service functions against a
// mocked Prisma client. The end-to-end capture flow is covered by
// tests/ci/recording/*.spec.ts. Mock the heavy imports so the module loads
// without a database or storage backend.
const prismaMock = vi.hoisted(() => ({
  recordingPart: { count: vi.fn() },
  recording: { findUnique: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(),
}));
const queueMock = vi.hoisted(() => ({ getLatestJob: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/services/pipeline/queue', () => queueMock);
vi.mock('@/services/storage', () => ({
  buildRecordingPartKey: vi.fn(),
  deleteObjectByKey: vi.fn(),
  saveAudio: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { Recording } from '@prisma/client';
import {
  CaptureRejectedError,
  RECORDING_STALE_SECONDS,
  baseMimeType,
  beginFinalize,
  summarizeRecording,
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

describe('summarizeRecording', () => {
  const now = 1_000_000_000_000;
  const base = {
    id: 'rec1',
    startedAt: new Date(now - 3_600_000),
    errorMessage: null,
  };

  it('sums segment bytes into a duration estimate', () => {
    const summary = summarizeRecording(
      { ...base, status: 'recording', lastHeartbeatAt: new Date(now - 5_000), segments: [{ sizeBytes: 6000 }, { sizeBytes: 6000 }] },
      now
    );
    expect(summary).toMatchObject({ id: 'rec1', status: 'recording', estimatedDurationSeconds: 2 });
  });

  it('derives interrupted from a stale heartbeat against the given DB clock', () => {
    const summary = summarizeRecording(
      { ...base, status: 'paused', lastHeartbeatAt: new Date(now - (RECORDING_STALE_SECONDS + 5) * 1000), segments: [] },
      now
    );
    expect(summary.status).toBe('interrupted');
    expect(summary.estimatedDurationSeconds).toBe(0);
  });

  it('passes terminal statuses through', () => {
    const summary = summarizeRecording(
      { ...base, status: 'failed', lastHeartbeatAt: new Date(0), errorMessage: 'boom', segments: [] },
      now
    );
    expect(summary).toMatchObject({ status: 'failed', errorMessage: 'boom' });
  });

  it('never exposes the recorder token', () => {
    const summary = summarizeRecording(
      { ...base, status: 'recording', lastHeartbeatAt: new Date(now), segments: [] },
      now
    );
    expect(Object.keys(summary)).not.toContain('recorderToken');
  });
});

describe('CaptureRejectedError', () => {
  it('carries the reason and the legacy message', () => {
    expect(new CaptureRejectedError('stale_token').message).toBe('Recording was taken over in another tab');
    expect(new CaptureRejectedError('not_capturing').reason).toBe('not_capturing');
  });
});

describe('beginFinalize', () => {
  const recording = (status: string) =>
    ({ id: 'rec1', sessionId: 'sess1', status, lastHeartbeatAt: new Date() }) as unknown as Recording;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.recordingPart.count.mockResolvedValue(3);
  });

  it('is ok when the conditional update wins', async () => {
    prismaMock.$executeRaw.mockResolvedValue(1);
    expect(await beginFinalize(recording('recording'), { recorderToken: 't' })).toBe('ok');
  });

  it('reports empty without touching status when no parts landed', async () => {
    prismaMock.recordingPart.count.mockResolvedValue(0);
    expect(await beginFinalize(recording('recording'))).toBe('empty');
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('reports still_capturing when a live recording refuses the update', async () => {
    const lastHeartbeatAt = new Date();
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.recording.findUnique.mockResolvedValue({ status: 'recording', lastHeartbeatAt });
    expect(await beginFinalize(recording('recording'))).toEqual({ kind: 'still_capturing', lastHeartbeatAt });
  });

  it('reports conflict when the update lost to a concurrent finalize', async () => {
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.recording.findUnique.mockResolvedValue({ status: 'finalizing', lastHeartbeatAt: new Date() });
    expect(await beginFinalize(recording('recording'))).toBe('conflict');
  });

  it('conflicts on terminal statuses', async () => {
    expect(await beginFinalize(recording('finalized'))).toBe('conflict');
  });

  it('re-enqueues a finalizing recording that has no active job (stuck-state escape)', async () => {
    queueMock.getLatestJob.mockResolvedValue({ status: 'failed' });
    expect(await beginFinalize(recording('finalizing'))).toBe('ok');
    queueMock.getLatestJob.mockResolvedValue({ status: 'running' });
    expect(await beginFinalize(recording('finalizing'))).toBe('conflict');
  });
});
