import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { runSummarizeStep } from '@/services/pipeline/steps/summarize';
import { isPermanentError } from '@/services/pipeline/errors';
import { requireSessionOwner, enforceRateLimit, zodErrorResponse } from '@/lib/route-utils';
import { aiSummaryRateLimiter } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

const updateSummarySchema = z.object({
  summary_text: z.string().min(1, 'Summary text is required'),
});

// POST /api/summary/[sessionId] - Generate (or with { force: true }, regenerate) summary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  let isFreshGeneration = false;

  try {
    const { error: authError, user } = await requireSessionOwner(sessionId);
    if (authError) return authError;

    const limited = enforceRateLimit(request, user.id, aiSummaryRateLimiter);
    if (limited) return limited;

    // COST PROTECTION: Block test accounts from real AI calls (skipped when mocked).
    if (isTestAccount(user.email!) && !isAiMocked()) {
      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI summary services. Please use a real email address to access this feature.',
          isTestAccount: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    const existingSummary = await db.getSummary(sessionId);
    if (existingSummary && !force) {
      return NextResponse.json({
        message: 'Summary already exists',
        summary: existingSummary.summaryText,
        skipped: true,
      });
    }

    // Fresh generation moves the session through the summarizing status;
    // force-regeneration of an existing summary leaves status untouched.
    isFreshGeneration = !existingSummary;
    if (isFreshGeneration) {
      await db.updateSession(sessionId, { status: 'summarizing' });
    }

    const summaryText = await runSummarizeStep(sessionId, { force });

    if (isFreshGeneration) {
      await db.updateSession(sessionId, { status: 'completed' });
    }

    return NextResponse.json({ message: 'Summary generated successfully', summary: summaryText });
  } catch (error) {
    logger.error('Summary generation error', error as Error, { sessionId });

    // Don't leave a fresh generation stranded in 'summarizing' — surface the
    // failure on the session so the UI shows the error banner with a retry.
    // Force-regeneration never touched the status, so leave it alone there.
    if (isFreshGeneration) {
      try {
        await db.setSessionError(sessionId, 'summary', error instanceof Error ? error.message : String(error));
      } catch (updateError) {
        logger.error('Failed to update session status', updateError as Error, { sessionId });
      }
    }

    if (isPermanentError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate summary' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

// GET /api/summary/[sessionId] - Get summary for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    const summary = await db.getSummary(sessionId);
    if (!summary) {
      return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('Failed to fetch summary', error as Error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}

// PUT /api/summary/[sessionId] - Update summary for a session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error: authError } = await requireSessionOwner(sessionId);
    if (authError) return authError;

    const validatedData = updateSummarySchema.parse(await request.json());

    const existingSummary = await db.getSummary(sessionId);
    if (!existingSummary) {
      return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
    }

    const updatedSummary = await db.updateSummary(sessionId, validatedData.summary_text);
    logger.info('Summary updated', { sessionId });

    return NextResponse.json({ message: 'Summary updated successfully', summary: updatedSummary });
  } catch (error) {
    const zodError = zodErrorResponse(error);
    if (zodError) return zodError;

    logger.error('Failed to update summary', error as Error);
    return NextResponse.json({ error: 'Failed to update summary' }, { status: 500 });
  }
}
