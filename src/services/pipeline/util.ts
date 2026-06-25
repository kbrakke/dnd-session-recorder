import { JobCancelledError } from './errors';

/**
 * Context handed to each pipeline step by the worker.
 *
 * Steps must call `assertActive()` at every durable checkpoint boundary
 * (e.g. between transcription chunks) so cancelled jobs stop promptly
 * instead of running to completion.
 */
export interface StepContext {
  jobId: string;
  isAbortRequested: () => boolean;
}

export function assertActive(ctx: StepContext): void {
  if (ctx.isAbortRequested()) {
    throw new JobCancelledError();
  }
}

/**
 * Reject if the promise doesn't settle within timeoutMs. The underlying
 * operation is not cancelled (Whisper/GPT calls can't be aborted reliably),
 * but the job moves on and the retry machinery takes over.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
