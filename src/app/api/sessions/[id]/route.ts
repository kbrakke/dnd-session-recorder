import { NextResponse } from 'next/server';
import { db } from '@/services/database';
import { requireSessionOwner } from '@/lib/route-utils';
import { logger } from '@/lib/logger';
import { dbNowMs, discardRecording, summarizeRecording } from '@/services/recording';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireSessionOwner((await params).id);
    if (error) return error;

    const recording = session.recording
      ? summarizeRecording(session.recording, await dbNowMs())
      : null;
    // `recording` after the spread: the raw relation must never leak.
    return NextResponse.json({ ...session, campaign_name: session.campaign.name, recording });
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

    // The schema cascade removes recording rows but not the part OBJECTS in
    // storage; discard first so an un-finalized recording leaves no orphans.
    if (session.recording && !['finalizing', 'finalized'].includes(session.recording.status)) {
      const recording = await prisma.recording.findUnique({ where: { id: session.recording.id } });
      if (recording) await discardRecording(recording);
    }
    await db.deleteSession(sessionId);

    return NextResponse.json({ message: 'Session deleted successfully', campaignId });
  } catch (error) {
    logger.error('Failed to delete session', error as Error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
