import { db } from '@/services/database';
import { generateAiText } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { PermanentJobError } from '../errors';
import { withTimeout } from '../util';
import { buildDmTodoPrompt, joinTranscriptions } from '../prompts';

const DM_TODO_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate the DM TODO list. Skips when one already exists unless `force`
 * is set (used by the regenerate endpoint).
 *
 * Returns the TODO list markdown.
 */
export async function runDmTodoStep(
  sessionId: string,
  options: { force?: boolean } = {}
): Promise<string> {
  const session = await db.getSessionById(sessionId);
  if (!session) {
    throw new PermanentJobError('Session no longer exists');
  }

  const existingTodoList = await db.getDmTodoList(sessionId);
  if (existingTodoList && !options.force) {
    logger.info('DM TODO list already exists, skipping step', { sessionId });
    return existingTodoList.content;
  }

  const campaign = await db.getCampaignById(session.campaignId);
  if (!campaign) {
    throw new PermanentJobError('Campaign no longer exists for this session');
  }

  const transcriptions = await db.getTranscriptions(sessionId);
  if (!transcriptions || transcriptions.length === 0) {
    throw new PermanentJobError('No transcriptions found for this session');
  }

  logger.info('Starting DM TODO list generation', { sessionId, force: !!options.force });

  const prompt = buildDmTodoPrompt(joinTranscriptions(transcriptions), campaign.systemPrompt);
  const { text: todoContent } = await withTimeout(
    generateAiText(prompt, 'dm-todo'),
    DM_TODO_TIMEOUT_MS,
    'DM TODO generation timed out after 10 minutes'
  );

  await db.saveDmTodoList(sessionId, todoContent);
  logger.info('DM TODO list generation completed', { sessionId });

  return todoContent;
}
