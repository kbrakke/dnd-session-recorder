import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/services/database';

// GET /api/sessions/[id]/progress - Get session progress
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getServerSession(authOptions);
    const sessionId = (await params).id;
    
    if (!authSession?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get session with progress information
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Check if user owns the campaign this session belongs to
    const campaign = await db.getCampaignById(session.campaignId);
    if (!campaign || campaign.userId !== authSession.user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Return progress information
    return NextResponse.json({
      status: session.status,
      duration: session.duration,
      transcriptionProgress: session.transcriptionProgress || 0,
      totalChunks: session.totalChunks || 0,
      chunksCompleted: session.chunksCompleted || 0,
      currentStep: session.currentStep || null,
      errorStep: session.errorStep || null,
      errorMessage: session.errorMessage || null,
    });
    
  } catch (error) {
    console.error('Error fetching session progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session progress' },
      { status: 500 }
    );
  }
}