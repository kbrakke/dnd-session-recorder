import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/services/database';

const createSessionSchema = z.object({
  campaign_id: z.number().int().positive('Campaign ID must be a positive integer'),
  title: z.string().min(1, 'Session title is required'),
  session_date: z.string().datetime('Invalid session date format'),
  audio_file_path: z.string().optional(),
  duration: z.number().int().positive().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json([]);
    }
    
    const sessions = await db.getSessions(session.user.id);
    
    // Transform data to match existing API format
    const transformedSessions = await Promise.all(sessions.map(async session => ({
      ...session,
      campaign_name: session.campaign.name,
      total_speech_time: session._count.transcriptions > 0 ? 
        await db.getTotalSpeechTime(session.id) : 0,
    })));
    
    return NextResponse.json(transformedSessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = createSessionSchema.parse(body);
    
    // Verify campaign exists
    const campaign = await db.getCampaignById(validatedData.campaign_id.toString());
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    const session = await db.createSession({
      campaignId: validatedData.campaign_id,
      title: validatedData.title,
      sessionDate: new Date(validatedData.session_date),
      audioFilePath: validatedData.audio_file_path,
      duration: validatedData.duration,
    });
    
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}