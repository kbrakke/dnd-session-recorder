import { db } from '@/services/database';
import { generateAiText } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { PermanentJobError } from '../errors';
import { withTimeout } from '../util';
import { buildSummaryPrompt, joinTranscriptions } from '../prompts';

const SUMMARY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate the session summary. Skips when a summary already exists unless
 * `force` is set (used by the regenerate endpoint).
 *
 * Returns the summary text.
 */
export async function runSummarizeStep(
  sessionId: string,
  options: { force?: boolean } = {}
): Promise<string> {
  const session = await db.getSessionById(sessionId);
  if (!session) {
    throw new PermanentJobError('Session no longer exists');
  }

  const existingSummary = await db.getSummary(sessionId);
  if (existingSummary && !options.force) {
    logger.info('Summary already exists, skipping step', { sessionId });
    return existingSummary.summaryText;
  }

  const campaign = await db.getCampaignById(session.campaignId);
  if (!campaign) {
    throw new PermanentJobError('Campaign no longer exists for this session');
  }

  const transcriptions = await db.getTranscriptions(sessionId);
  if (!transcriptions || transcriptions.length === 0) {
    throw new PermanentJobError('No transcriptions found for this session');
  }

  // Session status transitions are owned by the caller (worker sets
  // 'summarizing'; the force-regenerate route leaves status untouched).
  logger.info('Starting summary generation', { sessionId, force: !!options.force });

  const prompt = buildSummaryPrompt(joinTranscriptions(transcriptions), campaign.systemPrompt);
  const { text: summaryText } = await withTimeout(
    generateAiText(prompt, 'summary'),
    SUMMARY_TIMEOUT_MS,
    'Summary generation timed out after 10 minutes'
  );

  await db.saveSummary(sessionId, summaryText);
  logger.info('Summary generation completed', { sessionId });

  return summaryText;
}
