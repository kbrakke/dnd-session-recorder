import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ setSessionError: vi.fn() }));
const recordingMock = vi.hoisted(() => ({ markRecordingFailed: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/database', () => ({ db: dbMock }));
vi.mock('@/services/recording', () => recordingMock);
vi.mock('@/services/pipeline/steps/transcribe', () => ({ runTranscribeStep: vi.fn() }));
vi.mock('@/services/pipeline/steps/summarize', () => ({ runSummarizeStep: vi.fn() }));
vi.mock('@/services/pipeline/steps/dmTodo', () => ({ runDmTodoStep: vi.fn() }));
vi.mock('@/services/pipeline/steps/finalizeRecording', () => ({ runFinalizeRecordingStep: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { markReapedJobFailed } from '../worker';

describe('markReapedJobFailed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails the recording, not the draft session, for a reaped finalize job', async () => {
    await markReapedJobFailed('sess1', 'finalize_recording');
    expect(recordingMock.markRecordingFailed).toHaveBeenCalledWith('sess1', expect.any(String));
    expect(dbMock.setSessionError).not.toHaveBeenCalled();
  });

  it('errors the session for a reaped processing job', async () => {
    await markReapedJobFailed('sess1', 'process_session');
    expect(dbMock.setSessionError).toHaveBeenCalledWith('sess1', 'processing', expect.any(String));
    expect(recordingMock.markRecordingFailed).not.toHaveBeenCalled();
  });
});
