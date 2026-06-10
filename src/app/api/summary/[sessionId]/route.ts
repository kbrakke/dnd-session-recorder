import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { runSummarizeStep } from '@/services/pipeline/steps/summarize';
import { isPermanentError } from '@/services/pipeline/errors';
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

  try {
    // Check authentication and get user info
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // COST PROTECTION: Block test accounts from making real AI API calls.
    // Skipped when AI is mocked — no spend, so the pipeline can be tested.
    if (isTestAccount(user.email!) && !isAiMocked()) {
      logger.warn('Blocked test account from summary generation', {
        sessionId,
        userEmail: user.email
      });

      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI summary services. Please use a real email address to access this feature.',
          isTestAccount: true
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // IDEMPOTENCY: skip when a summary exists, unless explicitly regenerating
    const existingSummary = await db.getSummary(sessionId);
    if (existingSummary && !force) {
      logger.info('Summary already exists, skipping', { sessionId });

      return NextResponse.json({
        message: 'Summary already exists',
        summary: existingSummary.summaryText,
        skipped: true
      });
    }

    // Fresh generation moves the session through the summarizing status;
    // force-regeneration of an existing summary leaves status untouched.
    const isFreshGeneration = !existingSummary;
    if (isFreshGeneration) {
      await db.updateSession(sessionId, { status: 'summarizing' });
    }

    const summaryText = await runSummarizeStep(sessionId, { force });

    if (isFreshGeneration) {
      await db.updateSession(sessionId, { status: 'completed' });
    }

    return NextResponse.json({
      message: 'Summary generated successfully',
      summary: summaryText
    });

  } catch (error) {
    logger.error('Summary generation error', error as Error, { sessionId });

    if (isPermanentError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate summary' },
        { status: 400 }
      );
    }

    try {
      await db.setSessionError(sessionId, 'summary', error instanceof Error ? error.message : String(error));
    } catch (updateError) {
      logger.error('Failed to update session status', updateError as Error, { sessionId });
    }

    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

// GET /api/summary/[sessionId] - Get summary for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    const summary = await db.getSummary(sessionId);

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('Failed to fetch summary', error as Error);

    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}

// PUT /api/summary/[sessionId] - Update summary for a session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  try {
    // Check authentication
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const validatedData = updateSummarySchema.parse(body);

    // Verify session exists and belongs to user
    const gamingSession = await db.getSessionById(sessionId);
    if (!gamingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if user owns the campaign this session belongs to
    const campaign = await db.getCampaignById(gamingSession.campaignId);
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Verify summary exists
    const existingSummary = await db.getSummary(sessionId);
    if (!existingSummary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }
    
    // Update summary
    const updatedSummary = await db.updateSummary(sessionId, validatedData.summary_text);

    logger.info('Summary updated', { sessionId });
    
    return NextResponse.json({
      message: 'Summary updated successfully',
      summary: updatedSummary
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to update summary', error as Error);

    return NextResponse.json(
      { error: 'Failed to update summary' },
      { status: 500 }
    );
  }
}