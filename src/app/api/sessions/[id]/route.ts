import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/services/database';
import { requireSessionOwner, zodErrorResponse } from '@/lib/route-utils';
import { logger } from '@/lib/logger';

const updateSessionStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'error']),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireSessionOwner((await params).id);
    if (error) return error;

    return NextResponse.json({ ...session, campaign_name: session.campaign.name });
  } catch (error) {
    logger.error('Failed to fetch session', error as Error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = (await params).id;

  try {
    const { error } = await requireSessionOwner(sessionId);
    if (error) return error;

    const validatedData = updateSessionStatusSchema.parse(await request.json());
    const session = await db.updateSessionStatus(sessionId, validatedData.status);

    return NextResponse.json({ message: 'Session status updated successfully', session });
  } catch (error) {
    const zodError = zodErrorResponse(error);
    if (zodError) return zodError;

    logger.error('Failed to update session status', error as Error);
    return NextResponse.json({ error: 'Failed to update session status' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = (await params).id;

  try {
    const { error, session } = await requireSessionOwner(sessionId);
    if (error) return error;

    const campaignId = session.campaignId;
    await db.deleteSession(sessionId);

    return NextResponse.json({ message: 'Session deleted successfully', campaignId });
  } catch (error) {
    logger.error('Failed to delete session', error as Error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
