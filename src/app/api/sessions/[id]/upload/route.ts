import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/services/database';

const linkUploadSchema = z.object({
  upload_id: z.string().min(1, 'Upload ID is required'),
});

// POST /api/sessions/[id]/upload - Link upload to session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionId = (await params).id;
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const validatedData = linkUploadSchema.parse(body);
    
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
    
    // Check if session is in a state that allows upload linking
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      return NextResponse.json(
        { error: 'Cannot change upload after transcription has started' },
        { status: 400 }
      );
    }
    
    // Verify upload exists and belongs to user
    const upload = await db.getUploadById(validatedData.upload_id);
    if (!upload || upload.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }
    
    // Link upload to session
    const updatedSession = await db.linkSessionToUpload(sessionId, validatedData.upload_id);
    
    return NextResponse.json({
      message: 'Upload linked to session successfully',
      session: updatedSession
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Error linking upload to session:', error);
    return NextResponse.json(
      { error: 'Failed to link upload to session' },
      { status: 500 }
    );
  }
}

// PUT /api/sessions/[id]/upload - Replace session's upload
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const validatedData = linkUploadSchema.parse(body);
    
    // Verify session exists and belongs to user
    const { id } = await params;
    const gamingSession = await db.getSessionById(id);
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
    
    // Check if session is in a state that allows upload replacement
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      return NextResponse.json(
        { error: 'Cannot change upload after transcription has started' },
        { status: 400 }
      );
    }
    
    // Verify upload exists and belongs to user
    const upload = await db.getUploadById(validatedData.upload_id);
    if (!upload || upload.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }
    
    // Replace upload
    const updatedSession = await db.linkSessionToUpload(id, validatedData.upload_id);
    
    return NextResponse.json({
      message: 'Upload replaced successfully',
      session: updatedSession
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Error replacing upload:', error);
    return NextResponse.json(
      { error: 'Failed to replace upload' },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions/[id]/upload - Unlink upload from session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify session exists and belongs to user
    const { id } = await params;
    const gamingSession = await db.getSessionById(id);
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
    
    // Check if session is in a state that allows upload unlinking
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      return NextResponse.json(
        { error: 'Cannot remove upload after transcription has started' },
        { status: 400 }
      );
    }
    
    // Unlink upload from session
    const updatedSession = await db.unlinkSessionFromUpload(id);
    
    return NextResponse.json({
      message: 'Upload unlinked from session successfully',
      session: updatedSession
    });
    
  } catch (error) {
    console.error('Error unlinking upload from session:', error);
    return NextResponse.json(
      { error: 'Failed to unlink upload from session' },
      { status: 500 }
    );
  }
}