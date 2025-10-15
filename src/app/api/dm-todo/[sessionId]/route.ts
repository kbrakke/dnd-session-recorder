import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { isTestAccount } from '@/lib/whitelist';

const model = openai('gpt-4o');

const updateDmTodoSchema = z.object({
  content: z.string().min(1, 'TODO list content is required'),
});


// Helper to format transcriptions for TODO generation
function formatTranscriptionsForTodo(transcriptions: Array<{ text: string }>): string {
  return transcriptions
    .map(t => t.text)
    .join(' ');
}

// POST /api/dm-todo/[sessionId] - Generate DM TODO list
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
      console.log(`[DM TODO] Blocked test account ${user.email} from making AI API call for session ${sessionId}`);

      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI TODO list services. Please use a real email address to access this feature.',
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

    // IDEMPOTENCY: Check if TODO list already exists
    const existingTodoList = await db.getDmTodoList(sessionId);
    if (existingTodoList) {
      console.log(`[DM TODO] TODO list already exists for session ${sessionId}, skipping`);

      return NextResponse.json({
        message: 'DM TODO list already exists',
        content: existingTodoList.content,
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

    console.log(`[DM TODO] Starting TODO list generation for session ${sessionId}`);

    // Format transcriptions
    const formattedText = formatTranscriptionsForTodo(transcriptions);

    // Build the prompt with campaign context
    let basePrompt = `You are an experienced Dungeon Master assistant. Below is a transcript of a D&D session. Please create a comprehensive TODO list for the DM to help them prepare for the next session.

Your TODO list should be formatted in Markdown and include:

1. **Follow-ups on unresolved plot threads** - any cliffhangers, unanswered questions, or incomplete quests
2. **NPCs to develop** - characters mentioned who need more detail or backstory
3. **Locations to flesh out** - places the party plans to visit or showed interest in
4. **Rewards and loot** - items, treasure, or experience to distribute
5. **Consequences to implement** - results of player decisions or actions
6. **Combat encounters to prepare** - if the party is heading into danger
7. **Rules clarifications** - any mechanics that came up and need review
8. **Player character threads** - individual character goals or developments to address

Format the output as a clean Markdown TODO list with headers and checkboxes. Be specific and actionable.
When making this list, start by calling out the Three most important items first. 
DO NOT create items for the sake of filling out the list. Only create items that are actually relevant to the sessio and followup.
Avoid adding simple generic items, only include TODO items that come out of the transcript.`;

    // Add campaign-specific context if available
    if (campaign.systemPrompt) {
      basePrompt += `\n\nCampaign Context:\n${campaign.systemPrompt}`;
    }

    basePrompt += `\n\nSession Transcript:\n\n${formattedText}\n\nPlease provide a detailed TODO list to help the DM prepare for the next session.`;

    // Generate TODO list with Vercel AI SDK
    const { text: todoContent } = await generateText({
      model,
      prompt: basePrompt
    });

    // Save TODO list to database
    await db.saveDmTodoList(sessionId, todoContent);

    console.log(`[DM TODO] TODO list generation completed for session ${sessionId}`);

    return NextResponse.json({
      message: 'DM TODO list generated successfully',
      content: todoContent
    });

  } catch (error) {
    console.error('[DM TODO Error]:', error);

    return NextResponse.json(
      { error: 'Failed to generate DM TODO list' },
      { status: 500 }
    );
  }
}

// GET /api/dm-todo/[sessionId] - Get DM TODO list for a session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    const todoList = await db.getDmTodoList(sessionId);

    if (!todoList) {
      return NextResponse.json(
        { error: 'DM TODO list not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(todoList);
  } catch (error) {
    console.error('Error fetching DM TODO list:', error);

    return NextResponse.json(
      { error: 'Failed to fetch DM TODO list' },
      { status: 500 }
    );
  }
}

// PUT /api/dm-todo/[sessionId] - Update DM TODO list for a session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = updateDmTodoSchema.parse(body);

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

    // Verify TODO list exists
    const existingTodoList = await db.getDmTodoList(sessionId);
    if (!existingTodoList) {
      return NextResponse.json(
        { error: 'DM TODO list not found' },
        { status: 404 }
      );
    }

    // Update TODO list
    const updatedTodoList = await db.updateDmTodoList(sessionId, validatedData.content);

    console.log(`[DM TODO] TODO list updated for session ${sessionId}`);

    return NextResponse.json({
      message: 'DM TODO list updated successfully',
      todoList: updatedTodoList
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating DM TODO list:', error);

    return NextResponse.json(
      { error: 'Failed to update DM TODO list' },
      { status: 500 }
    );
  }
}
