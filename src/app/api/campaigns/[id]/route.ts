import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/services/database';
import { requireCampaignOwner, zodErrorResponse } from '@/lib/route-utils';
import { logger } from '@/lib/logger';

const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100),
  description: z.string().max(500).optional(),
  // Bounded: injected verbatim into every GPT-4o prompt for the campaign.
  systemPrompt: z.string().max(2000).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error: authError } = await requireCampaignOwner(id);
    if (authError) return authError;

    const validatedData = updateCampaignSchema.parse(await request.json());
    const updatedCampaign = await db.updateCampaign(id, validatedData);

    return NextResponse.json(updatedCampaign);
  } catch (error) {
    const zodError = zodErrorResponse(error);
    if (zodError) return zodError;

    logger.error('Failed to update campaign', error as Error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error: authError } = await requireCampaignOwner(id);
    if (authError) return authError;

    await db.deleteCampaign(id);
    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete campaign', error as Error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error: authError, campaign } = await requireCampaignOwner(id);
    if (authError) return authError;

    return NextResponse.json(campaign);
  } catch (error) {
    logger.error('Failed to fetch campaign', error as Error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}