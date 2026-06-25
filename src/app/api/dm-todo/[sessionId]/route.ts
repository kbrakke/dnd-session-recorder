import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { runDmTodoStep } from '@/services/pipeline/steps/dmTodo';
import { isPermanentError } from '@/services/pipeline/errors';
import { requireSessionOwner, enforceRateLimit, zodErrorResponse } from '@/lib/route-utils';
import { aiSummaryRateLimiter } from '@/lib/rate-limiter';
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
    const { error: authError, user } = await requireSessionOwner(sessionId);
    if (authError) return authError;

    const limited = enforceRateLimit(request, user.id, aiSummaryRateLimiter);
    if (limited) return limited;

    // COST PROTECTION: Block test accounts from real AI calls (skipped when mocked).
    if (isTestAccount(user.email!) && !isAiMocked()) {
      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI TODO list services. Please use a real email address to access this feature.',
          isTestAccount: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    const existingTodoList = await db.getDmTodoList(sessionId);
    if (existingTodoList && !force) {
      return NextResponse.json({
        message: 'DM TODO list already exists',
        content: existingTodoList.content,
        skipped: true,
      });
    }

    const todoContent = await runDmTodoStep(sessionId, { force });

    return NextResponse.json({ message: 'DM TODO list generated successfully', content: todoContent });
  } catch (error) {
    logger.error('DM TODO generation error', error as Error, { sessionId });

    if (isPermanentError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate DM TODO list' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to generate DM TODO list' }, { status: 500 });
  }
}

// GET /api/dm-todo/[sessionId] - Get DM TODO list for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    const todoList = await db.getDmTodoList(sessionId);
    if (!todoList) {
      return NextResponse.json({ error: 'DM TODO list not found' }, { status: 404 });
    }

    return NextResponse.json(todoList);
  } catch (error) {
    logger.error('Failed to fetch DM TODO list', error as Error);
    return NextResponse.json({ error: 'Failed to fetch DM TODO list' }, { status: 500 });
  }
}

// PUT /api/dm-todo/[sessionId] - Update DM TODO list for a session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const { error: authError } = await requireSessionOwner(sessionId);
    if (authError) return authError;

    const validatedData = updateDmTodoSchema.parse(await request.json());

    const existingTodoList = await db.getDmTodoList(sessionId);
    if (!existingTodoList) {
      return NextResponse.json({ error: 'DM TODO list not found' }, { status: 404 });
    }

    const updatedTodoList = await db.updateDmTodoList(sessionId, validatedData.content);
    logger.info('DM TODO list updated', { sessionId });

    return NextResponse.json({ message: 'DM TODO list updated successfully', todoList: updatedTodoList });
  } catch (error) {
    const zodError = zodErrorResponse(error);
    if (zodError) return zodError;

    logger.error('Failed to update DM TODO list', error as Error);
    return NextResponse.json({ error: 'Failed to update DM TODO list' }, { status: 500 });
  }
}
