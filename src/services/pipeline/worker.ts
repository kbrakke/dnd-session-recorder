import os from 'os';
import { randomUUID } from 'crypto';
import { PipelineJob } from '@prisma/client';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';
import {
  claimNextJob,
  completeJob,
  failJob,
  heartbeatJob,
  reapStaleJobs,
  setJobStep,
} from './queue';
import { errorMessage, isCancellation, isPermanentError } from './errors';
import { StepContext } from './util';
import { runTranscribeStep } from './steps/transcribe';
import { runSummarizeStep } from './steps/summarize';
import { runDmTodoStep } from './steps/dmTodo';

const POLL_INTERVAL_MS = Number(process.env.PIPELINE_POLL_INTERVAL_MS || 5000);
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const REAP_INTERVAL_MS = 60 * 1000;

const WORKER_ID = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

// Survive HMR module reloads in dev: state lives on globalThis.
const globalState = globalThis as unknown as {
  __pipelineWorker?: { started: boolean; stopped: boolean };
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute one claimed job: transcribe -> summarize -> dm_todo, each step
 * idempotent and internally checkpointed. A heartbeat keeps the lease alive
 * and detects external cancellation between checkpoints.
 */
async function runJob(job: PipelineJob): Promise<void> {
  const { sessionId } = job;
  let abortRequested = false;

  const heartbeat = setInterval(() => {
    heartbeatJob(job.id)
      .then(status => {
        if (status === null || status === 'cancelled') {
          abortRequested = true;
        }
      })
      .catch(err => logger.warn('Pipeline heartbeat failed', { jobId: job.id, error: errorMessage(err) }));
  }, HEARTBEAT_INTERVAL_MS);

  const ctx: StepContext = {
    jobId: job.id,
    isAbortRequested: () => abortRequested,
  };

  try {
    logger.info('Pipeline job started', {
      jobId: job.id,
      sessionId,
      attempt: job.attempts,
      workerId: WORKER_ID,
    });

    await setJobStep(job.id, 'transcribe');
    await runTranscribeStep(sessionId, ctx);

    await setJobStep(job.id, 'summarize');
    await db.updateSession(sessionId, { status: 'summarizing' });
    await runSummarizeStep(sessionId);

    await setJobStep(job.id, 'dm_todo');
    await runDmTodoStep(sessionId);

    await db.updateSession(sessionId, { status: 'completed' });
    await completeJob(job.id, 'dm_todo');
    logger.info('Pipeline job completed', { jobId: job.id, sessionId });
  } catch (error) {
    if (isCancellation(error)) {
      // The cancel endpoint already reset the session; just stop quietly.
      logger.info('Pipeline job cancelled mid-run', { jobId: job.id, sessionId });
      return;
    }

    const message = errorMessage(error);
    const permanent = isPermanentError(error);
    const outcome = await failJob(job, message, { permanent });

    logger.error('Pipeline job step failed', error as Error, {
      jobId: job.id,
      sessionId,
      attempt: job.attempts,
      permanent,
      outcome,
    });

    if (outcome === 'failed') {
      try {
        await db.setSessionError(sessionId, job.currentStep || 'processing', message);
      } catch (updateError) {
        logger.error('Failed to mark session errored', updateError as Error, { sessionId });
      }
    }
    // On retry ('pending') the session keeps its in-progress status so the
    // UI continues polling while the backoff elapses.
  } finally {
    clearInterval(heartbeat);
  }
}

async function workerLoop(): Promise<void> {
  const state = globalState.__pipelineWorker!;
  let lastReap = 0;

  logger.info('Pipeline worker started', { workerId: WORKER_ID, pollIntervalMs: POLL_INTERVAL_MS });

  while (!state.stopped) {
    try {
      if (Date.now() - lastReap >= REAP_INTERVAL_MS) {
        lastReap = Date.now();
        const { failedSessionIds } = await reapStaleJobs();
        for (const sessionId of failedSessionIds) {
          await db
            .setSessionError(sessionId, 'processing', 'Processing was interrupted repeatedly. Please retry.')
            .catch(err => logger.error('Failed to mark reaped session errored', err as Error, { sessionId }));
        }
      }

      const job = await claimNextJob(WORKER_ID);
      if (job) {
        await runJob(job);
        continue; // immediately look for more work
      }
    } catch (error) {
      logger.error('Pipeline worker loop error', error as Error, { workerId: WORKER_ID });
    }

    await sleep(POLL_INTERVAL_MS);
  }

  logger.info('Pipeline worker stopped', { workerId: WORKER_ID });
}

/**
 * Start the in-process pipeline worker. Called once from instrumentation.ts
 * when the Next.js server boots. Safe to call multiple times.
 */
export function startPipelineWorker(): void {
  if (process.env.PIPELINE_WORKER_ENABLED === 'false') {
    logger.info('Pipeline worker disabled via PIPELINE_WORKER_ENABLED=false');
    return;
  }
  if (globalState.__pipelineWorker?.started) {
    return;
  }
  globalState.__pipelineWorker = { started: true, stopped: false };

  const stop = () => {
    if (globalState.__pipelineWorker) {
      globalState.__pipelineWorker.stopped = true;
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // Fire and forget; the loop logs its own failures.
  void workerLoop();
}
