import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;
    
    const campaigns = await db.getCampaigns(user.id);
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;
    
    const body = await request.json();
    const validatedData = createCampaignSchema.parse(body);
    
    const campaign = await db.createCampaign({
      name: validatedData.name,
      description: validatedData.description,
      systemPrompt: validatedData.systemPrompt,
      userId: user.id,
    });
    
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Error creating campaign:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}