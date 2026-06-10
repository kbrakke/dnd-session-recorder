/**
 * Next.js instrumentation hook — runs once when the server process boots
 * (dev, standalone production, and Fly machines alike).
 *
 * Starts the durable pipeline worker that drains the pipeline_jobs queue.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPipelineWorker } = await import('@/services/pipeline/worker');
    startPipelineWorker();
  }
}
