/**
 * Error taxonomy for the processing pipeline.
 *
 * The worker retries jobs with exponential backoff by default. Throw
 * PermanentJobError from a step when retrying cannot help (missing file,
 * missing prerequisite data) so the job fails immediately instead of
 * burning retry attempts.
 */

export class PermanentJobError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/** Thrown inside a step when the job was cancelled mid-flight. */
export class JobCancelledError extends Error {
  constructor(message = 'Job was cancelled') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

export function isPermanentError(error: unknown): boolean {
  return error instanceof PermanentJobError;
}

export function isCancellation(error: unknown): boolean {
  return error instanceof JobCancelledError;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
