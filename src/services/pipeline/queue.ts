import { prisma } from '@/lib/prisma';
import { PipelineJob, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { computeBackoffMs, shouldRetry } from './backoff';

/**
 * Postgres-backed durable job queue for the session processing pipeline.
 *
 * Durability properties:
 * - Enqueue is idempotent per session (at most one pending/running job).
 * - Claiming uses FOR UPDATE SKIP LOCKED, so any number of workers (one per
 *   Fly machine) can poll the same table without double-claiming.
 * - Running jobs hold a lease via heartbeat_at. If a worker dies mid-job
 *   (deploy, OOM, machine stop) the reaper requeues the job once the lease
 *   goes stale; per-step checkpoints make the re-run cheap.
 * - Failures retry with exponential backoff up to max_attempts; permanent
 *   failures (missing file, missing prerequisites) fail immediately.
 */

export const STALE_LEASE_MINUTES = 2;

export type ActiveJobStatus = 'pending' | 'running';

/**
 * Enqueue a processing job for a session. Idempotent: if an active job
 * already exists it is returned (and, if it was waiting out a retry backoff,
 * made immediately runnable — a manual kick should not have to wait).
 */
export async function enqueueProcessSession(
  sessionId: string
): Promise<{ job: PipelineJob; created: boolean }> {
  return prisma.$transaction(async tx => {
    // Lock the session row to serialize concurrent enqueues for one session.
    await tx.$queryRaw`SELECT id FROM gaming_sessions WHERE id = ${sessionId} FOR UPDATE`;

    const existing = await tx.pipelineJob.findFirst({
      where: { sessionId, status: { in: ['pending', 'running'] } },
      orderBy: { createdAt: 'desc' },
    });

    // Time-sensitive fields are written with the DATABASE clock (NOW()), not
    // the app server's: the claim query compares run_after <= NOW() in
    // Postgres, and any clock skew between app and DB would delay (or
    // prematurely run) jobs if we mixed clock sources.
    if (existing) {
      if (existing.status === 'pending') {
        await tx.$executeRaw`
          UPDATE pipeline_jobs SET run_after = NOW(), attempts = 0, updated_at = NOW()
          WHERE id = ${existing.id}
        `;
        const kicked = await tx.pipelineJob.findUniqueOrThrow({ where: { id: existing.id } });
        return { job: kicked, created: false };
      }
      return { job: existing, created: false };
    }

    const created = await tx.pipelineJob.create({ data: { sessionId } });
    await tx.$executeRaw`
      UPDATE pipeline_jobs SET run_after = NOW() WHERE id = ${created.id}
    `;
    const job = await tx.pipelineJob.findUniqueOrThrow({ where: { id: created.id } });
    return { job, created: true };
  });
}

/**
 * Atomically claim the next runnable job. Increments attempts and takes the
 * lease. Returns null when the queue is empty.
 */
export async function claimNextJob(workerId: string): Promise<PipelineJob | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE pipeline_jobs
    SET status = 'running',
        locked_by = ${workerId},
        locked_at = NOW(),
        heartbeat_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = (
      SELECT id FROM pipeline_jobs
      WHERE status = 'pending' AND run_after <= NOW()
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  if (rows.length === 0) return null;
  return prisma.pipelineJob.findUnique({ where: { id: rows[0].id } });
}

/**
 * Renew the lease on a running job. Returns the job's current status so the
 * worker can notice external cancellation, or null if the job row is gone
 * (session deleted).
 */
export async function heartbeatJob(jobId: string): Promise<string | null> {
  // DB clock (NOW()), matching the reaper's staleness comparison.
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    UPDATE pipeline_jobs SET heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}
    RETURNING status
  `;
  return rows.length > 0 ? rows[0].status : null; // null: job deleted out from under us
}

export async function completeJob(jobId: string, finalStep: string): Promise<void> {
  try {
    await prisma.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        currentStep: finalStep,
        lockedBy: null,
        lockedAt: null,
        lastError: null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return; // session (and job) deleted mid-run; nothing to record
    }
    throw error;
  }
}

/**
 * Record a step failure. Requeues with exponential backoff while attempts
 * remain (and the error is not permanent); otherwise marks the job failed.
 * Returns the resulting job status ('pending' or 'failed').
 */
export async function failJob(
  job: Pick<PipelineJob, 'id' | 'attempts' | 'maxAttempts'>,
  message: string,
  options: { permanent?: boolean } = {}
): Promise<'pending' | 'failed'> {
  const retry = shouldRetry(job.attempts, job.maxAttempts, !!options.permanent);

  if (retry) {
    // Backoff is computed relative to the DB clock to stay consistent with
    // the claim query's run_after <= NOW() comparison.
    const backoffMs = computeBackoffMs(job.attempts);
    await prisma.$executeRaw`
      UPDATE pipeline_jobs
      SET status = 'pending',
          run_after = NOW() + (${backoffMs}::int * INTERVAL '1 millisecond'),
          locked_by = NULL,
          locked_at = NULL,
          last_error = ${message},
          updated_at = NOW()
      WHERE id = ${job.id}
    `;
    return 'pending';
  }

  await prisma.pipelineJob.updateMany({
    where: { id: job.id },
    data: {
      status: 'failed',
      lockedBy: null,
      lockedAt: null,
      lastError: message,
    },
  });
  return 'failed';
}

/**
 * Update the step pointer on a running job (progress bookkeeping only).
 */
export async function setJobStep(jobId: string, step: string): Promise<void> {
  await prisma.pipelineJob.updateMany({
    where: { id: jobId },
    data: { currentStep: step },
  });
}

/**
 * Cancel any active job for a session. Pending jobs are cancelled outright;
 * running jobs are flagged cancelled and the worker aborts at its next
 * checkpoint boundary.
 */
export async function cancelActiveJobs(sessionId: string): Promise<number> {
  const result = await prisma.pipelineJob.updateMany({
    where: { sessionId, status: { in: ['pending', 'running'] } },
    data: { status: 'cancelled' },
  });
  return result.count;
}

/** Most recent job for a session, for progress/debug endpoints. */
export async function getLatestJob(sessionId: string): Promise<PipelineJob | null> {
  return prisma.pipelineJob.findFirst({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Recover jobs whose worker died: any 'running' job with a stale heartbeat
 * is either requeued (attempts remaining) or failed. Returns sessions whose
 * jobs were terminally failed so callers can mark them errored.
 */
export async function reapStaleJobs(): Promise<{ requeued: number; failedSessionIds: string[] }> {
  const failedRows = await prisma.$queryRaw<Array<{ session_id: string }>>`
    UPDATE pipeline_jobs
    SET status = 'failed',
        last_error = 'Processing was interrupted repeatedly (worker lease expired after max attempts)',
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
    WHERE status = 'running'
      AND heartbeat_at < NOW() - (${STALE_LEASE_MINUTES}::int * INTERVAL '1 minute')
      AND attempts >= max_attempts
    RETURNING session_id
  `;

  const requeued = await prisma.$executeRaw`
    UPDATE pipeline_jobs
    SET status = 'pending',
        run_after = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        last_error = 'Worker lease expired; job requeued',
        updated_at = NOW()
    WHERE status = 'running'
      AND heartbeat_at < NOW() - (${STALE_LEASE_MINUTES}::int * INTERVAL '1 minute')
  `;

  if (failedRows.length > 0 || requeued > 0) {
    logger.warn('Reaped stale pipeline jobs', {
      requeued,
      failed: failedRows.length,
    });
  }

  return { requeued, failedSessionIds: failedRows.map(r => r.session_id) };
}
