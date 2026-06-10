import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/services/database';
import { requireSessionOwner } from '@/lib/route-utils';
import { logger } from '@/lib/logger';

// GET /api/sessions/[id]/transcriptions - Get transcriptions for a session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    return NextResponse.json(await db.getTranscriptions(sessionId));
  } catch (error) {
    logger.error('Failed to fetch transcriptions', error as Error);
    return NextResponse.json({ error: 'Failed to fetch transcriptions' }, { status: 500 });
  }
}
