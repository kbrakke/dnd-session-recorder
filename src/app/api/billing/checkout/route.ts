import { NextResponse } from 'next/server';
import { requireAuthForSensitiveAction } from '@/lib/auth-utils';
import { isStripeConfigured } from '@/lib/stripe';
import { createSubscriptionCheckoutSession } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * POST /api/billing/checkout
 * Creates a subscription Checkout Session for the authenticated user and
 * returns { url } for the browser to redirect to.
 */
export async function POST(request: Request) {
  const { error, user } = await requireAuthForSensitiveAction(request);
  if (error) return error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin;
    const session = await createSubscriptionCheckoutSession(user.id, baseUrl);
    if (!session.url) {
      throw new Error('Checkout session has no redirect URL');
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error('Failed to create checkout session', err as Error, { userId: user.id });
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}
