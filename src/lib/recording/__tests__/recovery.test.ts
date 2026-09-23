import { describe, expect, it } from 'vitest';
import { decideRecovery, isStranded, planDrain, runDrain } from '../recovery';
import type { UploadQueue } from '../upload-queue';
import type { ChunkMeta, RecordingSegmentState } from '../types';

const chunk = (segmentIndex: number, seq: number, partIndex: number): ChunkMeta => ({
  recordingId: 'r', segmentIndex, seq, partIndex, size: 10, durationMs: 1000, mediaEndMs: seq * 1000, capturedAt: 0,
});
const seg = (index: number, maxPartIndex: number | null): RecordingSegmentState => ({
  index, status: 'open', partCount: maxPartIndex === null ? 0 : maxPartIndex + 1, maxPartIndex, sizeBytes: 0,
});
const describeJobs = (jobs: ReturnType<typeof planDrain>['jobs']) =>
  jobs.map(j => (j.kind === 'open' ? `open ${j.segmentIndex}` : j.kind === 'part' ? `part ${j.segmentIndex}/${j.partIndex}` : `close ${j.segmentIndex}=${j.partCount}`));

describe('planDrain', () => {
  it('opens segments the server never saw, ascending, before their parts', () => {
    // Server has segments 0-1; local tail in segment 2 (never opened) and 3.
    const plan = planDrain(
      [chunk(3, 0, 0), chunk(2, 0, 0), chunk(2, 1, 0), chunk(2, 2, 1)],
      { segments: [seg(0, 4), seg(1, 2)] }
    );
    expect(describeJobs(plan.jobs)).toEqual([
      'open 2', 'part 2/0', 'part 2/1', 'close 2=2',
      'open 3', 'part 3/0', 'close 3=1',
    ]);
    expect(plan.nextSegmentIndex).toBe(4);
    expect(plan.totalParts).toBe(3);
  });

  it('opens an empty intermediate segment so the next open is not a gap', () => {
    const plan = planDrain([chunk(4, 0, 0)], { segments: [seg(0, 1), seg(1, 0), seg(2, 0)] });
    expect(describeJobs(plan.jobs)).toEqual(['open 3', 'open 4', 'part 4/0', 'close 4=1']);
  });

  it('closes with the server ledger when earlier parts were already ACKed', () => {
    // Crash in segment 1 after parts 0-5 landed; local tail is parts 6-7.
    const plan = planDrain([chunk(1, 60, 6), chunk(1, 70, 7)], { segments: [seg(0, 3), seg(1, 5)] });
    expect(describeJobs(plan.jobs)).toEqual(['part 1/6', 'part 1/7', 'close 1=8']);
    expect(plan.nextSegmentIndex).toBe(2);
  });

  it('uses the larger count when the server already has later parts (lost ACK)', () => {
    const plan = planDrain([chunk(0, 5, 2)], { segments: [seg(0, 4)] });
    expect(describeJobs(plan.jobs)).toEqual(['part 0/2', 'close 0=5']);
  });

  it('plans nothing without a tail', () => {
    const plan = planDrain([], { segments: [seg(0, 1)] });
    expect(plan).toEqual({ jobs: [], totalParts: 0, nextSegmentIndex: 1, highestLocalSegment: null });
  });
});

describe('decideRecovery', () => {
  const base = { uploadId: null, pendingCount: 0, lockHeld: false } as const;
  it('routes by server status', () => {
    expect(decideRecovery({ ...base, uploadId: 'u', recordingStatus: 'recording' })).toEqual({ action: 'redirect-session' });
    expect(decideRecovery({ ...base, recordingStatus: null })).toEqual({ action: 'fresh' });
    expect(decideRecovery({ ...base, recordingStatus: 'finalizing' })).toEqual({ action: 'finalizing' });
    expect(decideRecovery({ ...base, recordingStatus: 'finalized' })).toEqual({ action: 'redirect-processing' });
    expect(decideRecovery({ ...base, recordingStatus: 'failed', pendingCount: 3 })).toEqual({ action: 'failed', strandLocal: true });
  });

  it('never drains while another tab in this browser holds the lock', () => {
    expect(decideRecovery({ ...base, recordingStatus: 'interrupted', pendingCount: 5, lockHeld: true })).toEqual({ action: 'live-elsewhere' });
  });

  it('drains a local tail or an interrupted recording', () => {
    expect(decideRecovery({ ...base, recordingStatus: 'recording', pendingCount: 2 })).toEqual({ action: 'drain' });
    expect(decideRecovery({ ...base, recordingStatus: 'interrupted' })).toEqual({ action: 'drain' });
  });

  it('a fresh heartbeat with no tail is live elsewhere (explicit Take over)', () => {
    expect(decideRecovery({ ...base, recordingStatus: 'paused' })).toEqual({ action: 'live-elsewhere' });
  });
});

describe('isStranded', () => {
  it('only capturing recordings accept a drain', () => {
    expect(isStranded('not-found')).toBe(true);
    expect(isStranded('finalizing')).toBe(true);
    expect(isStranded('finalized')).toBe(true);
    expect(isStranded('failed')).toBe(true);
    expect(isStranded('interrupted')).toBe(false);
    expect(isStranded('recording')).toBe(false);
  });
});

describe('runDrain', () => {
  it('enqueues every job and reports the outcome', async () => {
    const enqueued: unknown[] = [];
    const ok = { enqueue: (j: unknown) => enqueued.push(j), drained: async () => undefined } as unknown as UploadQueue;
    const plan = planDrain([chunk(0, 0, 0)], { segments: [] });
    expect(await runDrain(ok, plan)).toEqual({ kind: 'done' });
    expect(enqueued).toHaveLength(plan.jobs.length);
    const bad = { enqueue: () => undefined, drained: async () => { throw new Error('taken over'); } } as unknown as UploadQueue;
    expect(await runDrain(bad, plan)).toMatchObject({ kind: 'failed' });
  });
});
