import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();

    // Check if the campaign belongs to the user
    const campaign = await db.getCampaignById(id);
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }
    
    const validatedData = updateCampaignSchema.parse(body);
    
    const updatedCampaign = await db.updateCampaign(id, {
      name: validatedData.name,
      description: validatedData.description,
      systemPrompt: validatedData.systemPrompt,
    });
    
    return NextResponse.json(updatedCampaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to update campaign', error as Error);

    return NextResponse.json(
      { error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;

    // Check if the campaign belongs to the user
    const campaign = await db.getCampaignById(id);
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    await db.deleteCampaign(id);

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete campaign', error as Error);

    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;

    const campaign = await db.getCampaignById(id);

    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(campaign);
  } catch (error) {
    logger.error('Failed to fetch campaign', error as Error);

    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}