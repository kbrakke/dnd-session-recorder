import { NextResponse } from 'next/server';
import { db } from '@/services/database';
import { requireSessionOwner } from '@/lib/route-utils';
import { logger } from '@/lib/logger';

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
