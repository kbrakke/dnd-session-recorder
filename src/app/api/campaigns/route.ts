import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100),
  description: z.string().max(500).optional(),
  // Bounded: this text is injected verbatim into every GPT-4o prompt for the
  // campaign, so its length directly drives token cost.
  systemPrompt: z.string().max(2000).optional(),
});

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;
    
    const campaigns = await db.getCampaigns(user.id);
    return NextResponse.json(campaigns);
  } catch (error) {
    logger.error('Failed to fetch campaigns', error as Error);
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

    logger.error('Failed to create campaign', error as Error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}