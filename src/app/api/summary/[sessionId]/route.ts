import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

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
    console.error('Error updating session status:', error);
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
    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
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

    console.log(`[Summary] Starting summary generation for session ${sessionId}`);
    await updateSessionStatus(sessionId, 'processing');

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
    
    console.log(`[Summary] Summary generation completed for session ${sessionId}`);

    return NextResponse.json({
      message: 'Summary generated successfully',
      summary: summaryText
    });

  } catch (error) {
    console.error('[Summary Error]:', error);
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
    console.error('Error fetching summary:', error);
    
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
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
    if (!campaign || campaign.userId !== session.user.id) {
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
    
    console.log(`[Summary] Summary updated for session ${sessionId}`);
    
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
    
    console.error('Error updating summary:', error);
    
    return NextResponse.json(
      { error: 'Failed to update summary' },
      { status: 500 }
    );
  }
}