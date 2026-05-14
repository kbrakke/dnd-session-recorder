import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai';
import { isTestAccount } from '@/lib/whitelist';
import { logger } from '@/lib/logger';

const model = openai('gpt-4o');

const updateSummarySchema = z.object({
  summary_text: z.string().min(1, 'Summary text is required'),
});

// Helper to update session status
async function updateSessionStatus(sessionId: string, status: string, errorStep?: string, errorMessage?: string): Promise<void> {
  try {
    await db.updateSession(sessionId, {
      status,
      errorStep: errorStep || null,
      errorMessage: errorMessage || null,
    });
  } catch (error) {
    logger.error('Failed to update session status', error as Error, { sessionId });
    throw error;
  }
}

// Helper to format transcriptions for summary
function formatTranscriptionsForSummary(transcriptions: Array<{ text: string }>): string {
  return transcriptions
    .map(t => t.text)
    .join(' ');
}

// POST /api/summary/[sessionId] - Generate summary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication and get user info
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // COST PROTECTION: Block test accounts from making AI API calls
    if (isTestAccount(user.email!)) {
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

    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // IDEMPOTENCY: Check if summary already exists
    const existingSummary = await db.getSummary(sessionId);
    if (existingSummary) {
      logger.info('Summary already exists, skipping', { sessionId });

      // Update status to completed if not already
      if (session.status !== 'completed') {
        await updateSessionStatus(sessionId, 'completed');
      }

      return NextResponse.json({
        message: 'Summary already exists',
        summary: existingSummary.summaryText,
        skipped: true
      });
    }

    // Get campaign information to include system prompt
    const campaign = await db.getCampaignById(session.campaignId);
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Get transcriptions for this session
    const transcriptions = await db.getTranscriptions(sessionId);

    if (!transcriptions || transcriptions.length === 0) {
      return NextResponse.json(
        { error: 'No transcriptions found for this session' },
        { status: 400 }
      );
    }

    logger.info('Starting summary generation', { sessionId });
    await updateSessionStatus(sessionId, 'summarizing');

    // Format transcriptions for summarization
    const formattedText = formatTranscriptionsForSummary(transcriptions);

    // Build the prompt with optional campaign context
    let basePrompt = `You are a skilled storyteller and D&D campaign chronicler. Below is a transcript of a D&D session. Please create an engaging summary that:

1. Tells the story of what happened in this session
2. Identifies key events, decisions, and character moments
3. Mentions which characters were involved in important scenes
4. Maintains the narrative flow and excitement of the session
5. Uses the character names provided
6. Focuses on story elements, combat highlights, and character development`;

    // Add campaign-specific context if available
    if (campaign.systemPrompt) {
      basePrompt += `\n\nCampaign Context:\n${campaign.systemPrompt}`;
    }

    basePrompt += `\n\nHere's the transcript:\n\n${formattedText}\n\nPlease provide a compelling summary that captures the essence of this D&D session.`;

    // Generate summary with Vercel AI SDK
    const { text: summaryText } = await generateText({
      model,
      prompt: basePrompt
    });

    // Save summary to database
    await db.saveSummary(sessionId, summaryText);
    await updateSessionStatus(sessionId, 'completed');

    logger.info('Summary generation completed', { sessionId });

    return NextResponse.json({
      message: 'Summary generated successfully',
      summary: summaryText
    });

  } catch (error) {
    logger.error('Summary generation error', error as Error, { sessionId });
    await updateSessionStatus(
      sessionId,
      'error',
      'summary',
      error instanceof Error ? error.message : String(error)
    );

    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

// GET /api/summary/[sessionId] - Get summary for a session
export async function GET(
  request: NextRequest,
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