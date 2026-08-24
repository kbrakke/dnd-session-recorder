import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { isStripeConfigured } from '@/lib/stripe';
import {
  getUserSubscription,
  getSubscriptionPriceInfo,
  isSubscriptionActive,
  type SubscriptionPriceInfo,
} from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * GET /api/billing/subscription
 * Returns the authenticated user's subscription status (from our mirror
 * table, kept current by the Stripe webhook) plus the resolved price the
 * billing page should advertise.
 */
export async function GET() {
  const { error, user } = await requireAuth();
  if (error) return error;

  const subscription = await getUserSubscription(user.id);

  // Status must keep working when Stripe is unconfigured or briefly down —
  // the price is display data, not a hard dependency
  let price: SubscriptionPriceInfo | null = null;
  if (isStripeConfigured()) {
    try {
      price = await getSubscriptionPriceInfo();
    } catch (err) {
      logger.warn(`Failed to resolve subscription price: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    price,
    active: isSubscriptionActive(subscription),
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  });
}
