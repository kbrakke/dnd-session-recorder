import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { runDmTodoStep } from '@/services/pipeline/steps/dmTodo';
import { isPermanentError } from '@/services/pipeline/errors';
import { logger } from '@/lib/logger';

const updateDmTodoSchema = z.object({
  content: z.string().min(1, 'TODO list content is required'),
});

// POST /api/dm-todo/[sessionId] - Generate (or with { force: true }, regenerate) DM TODO list
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
      logger.warn('Blocked test account from DM TODO generation', {
        sessionId,
        userEmail: user.email
      });

      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI TODO list services. Please use a real email address to access this feature.',
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

    // IDEMPOTENCY: skip when a TODO list exists, unless explicitly regenerating
    const existingTodoList = await db.getDmTodoList(sessionId);
    if (existingTodoList && !force) {
      logger.info('DM TODO list already exists, skipping', { sessionId });

      return NextResponse.json({
        message: 'DM TODO list already exists',
        content: existingTodoList.content,
        skipped: true
      });
    }

    const todoContent = await runDmTodoStep(sessionId, { force });

    return NextResponse.json({
      message: 'DM TODO list generated successfully',
      content: todoContent
    });

  } catch (error) {
    logger.error('DM TODO generation error', error as Error, { sessionId });

    if (isPermanentError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate DM TODO list' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate DM TODO list' },
      { status: 500 }
    );
  }
}

// GET /api/dm-todo/[sessionId] - Get DM TODO list for a session
export async function GET(
  _request: NextRequest,
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
    logger.error('Failed to fetch DM TODO list', error as Error);

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
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

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
    if (!campaign || campaign.userId !== user.id) {
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

    logger.info('DM TODO list updated', { sessionId });

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

    logger.error('Failed to update DM TODO list', error as Error);

    return NextResponse.json(
      { error: 'Failed to update DM TODO list' },
      { status: 500 }
    );
  }
}
