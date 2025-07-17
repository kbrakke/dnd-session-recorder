import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/services/database';

const updateSessionStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'error']),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }
    
    const session = await db.getSessionById(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Transform data to match existing API format
    const transformedSession = {
      ...session,
      campaign_name: session.campaign.name,
    };
    
    return NextResponse.json(transformedSession);
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const validatedData = updateSessionStatusSchema.parse(body);
    
    const session = await db.updateSessionStatus(sessionId, validatedData.status);
    
    return NextResponse.json({ message: 'Session status updated successfully', session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Error updating session status:', error);
    return NextResponse.json(
      { error: 'Failed to update session status' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }
    
    await db.deleteSession(sessionId);
    
    return NextResponse.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}