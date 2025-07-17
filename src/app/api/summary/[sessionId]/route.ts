import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/services/database';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to update session status
async function updateSessionStatus(sessionId: string, status: string, errorStep?: string, errorMessage?: string): Promise<void> {
  try {
    await db.updateSession(parseInt(sessionId), {
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
    const session = await db.getSessionById(parseInt(sessionId));
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get transcriptions for this session
    const transcriptions = await db.getTranscriptions(parseInt(sessionId));
    
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

    // Generate summary with OpenAI Chat API
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a skilled storyteller and D&D campaign chronicler. Below is a transcript of a D&D session. Please create an engaging summary that:

1. Tells the story of what happened in this session
2. Identifies key events, decisions, and character moments
3. Mentions which characters were involved in important scenes
4. Maintains the narrative flow and excitement of the session
5. Uses the character names provided
6. Focuses on story elements, combat highlights, and character development

Here's the transcript:

${formattedText}

Please provide a compelling summary that captures the essence of this D&D session.`
      }]
    });

    const summaryText = summaryResponse.choices[0]?.message?.content || '';

    // Save summary to database
    await db.saveSummary(parseInt(sessionId), summaryText);
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
    const summary = await db.getSummary(parseInt(sessionId));
    
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