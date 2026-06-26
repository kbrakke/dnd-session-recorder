import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getUserSubscription, isSubscriptionActive } from '@/services/billing';

/**
 * GET /api/billing/subscription
 * Returns the authenticated user's subscription status (from our mirror
 * table, kept current by the Stripe webhook).
 */
export async function GET() {
  const { error, user } = await requireAuth();
  if (error) return error;

  const subscription = await getUserSubscription(user.id);
  return NextResponse.json({
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
