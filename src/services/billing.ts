import Stripe from 'stripe';
import type { Subscription } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getStripe, STRIPE_PREVIEW_API_VERSION } from '@/lib/stripe';
import { logger } from '@/lib/logger';

// The single subscription product this app sells. Identified in Stripe by
// metadata so re-deploys and multiple environments don't create duplicates.
const PRODUCT_METADATA_KEY = 'app';
const PRODUCT_METADATA_VALUE = 'dnd-session-recorder';

const SUBSCRIPTION_PRODUCT: Stripe.ProductCreateParams = {
  name: 'Basic subscription',
  description: 'A basic subscription to our service',
  // Digital-product tax code required for Managed Payments eligibility
  tax_code: 'txcd_10103100',
  default_price_data: {
    unit_amount: 1000,
    currency: 'usd',
    recurring: { interval: 'month' },
  },
  metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
};

let cachedPriceId: string | null = null;

/**
 * Resolve the monthly price to sell. Precedence: STRIPE_PRICE_ID env var,
 * then an existing product tagged with our metadata, then create the product
 * (with its default price) per the Managed Payments setup.
 */
export async function ensureSubscriptionPrice(): Promise<string> {
  if (process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }
  if (cachedPriceId) {
    return cachedPriceId;
  }

  const stripe = getStripe();
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (p) => p.metadata[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE && p.default_price
  );
  if (existing) {
    cachedPriceId =
      typeof existing.default_price === 'string'
        ? existing.default_price
        : (existing.default_price as Stripe.Price).id;
    return cachedPriceId;
  }

  const product = await stripe.products.create(SUBSCRIPTION_PRODUCT, {
    apiVersion: STRIPE_PREVIEW_API_VERSION,
  });
  logger.info(`Created Stripe subscription product ${product.id}`);
  cachedPriceId = product.default_price as string;
  return cachedPriceId;
}

/**
 * Return the user's Stripe customer id, creating the customer (and persisting
 * the id on the User row) on first use.
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, email: true, name: true },
  });
  if (!user) {
    throw new Error('User not found');
  }
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Create a subscription-mode Checkout Session with Managed Payments enabled
 * (Stripe acts as merchant of record and handles tax). Returns the session;
 * redirect the browser to session.url.
 */
export async function createSubscriptionCheckoutSession(
  userId: string,
  baseUrl: string
): Promise<Stripe.Checkout.Session> {
  const [customerId, priceId] = await Promise.all([
    getOrCreateStripeCustomer(userId),
    ensureSubscriptionPrice(),
  ]);

  const params = {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId } },
    success_url: `${baseUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?checkout=cancelled`,
    // Preview-only parameter, not yet in the SDK types (hence the cast)
    managed_payments: { enabled: true },
  } as Stripe.Checkout.SessionCreateParams;

  return getStripe().checkout.sessions.create(params, {
    apiVersion: STRIPE_PREVIEW_API_VERSION,
  });
}

/**
 * Upsert our mirror row from a Stripe subscription object. Stripe is the
 * source of truth; upserting by stripeSubscriptionId keeps webhook replays
 * and out-of-order deliveries idempotent.
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  let userId = subscription.metadata?.userId || fallbackUserId || null;
  if (!userId) {
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    userId = user?.id ?? null;
  }
  if (!userId) {
    logger.warn(`No user found for Stripe subscription ${subscription.id} (customer ${customerId})`);
    return;
  }

  // Billing periods are item-level as of API 2025-03-31; single-item sub here
  const item = subscription.items.data[0];
  const currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: item?.price?.id ?? null,
      status: subscription.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      status: subscription.status,
      stripePriceId: item?.price?.id ?? null,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  logger.info(`Synced Stripe subscription ${subscription.id} (${subscription.status})`, {
    userId,
  });
}

/**
 * Dispatch a verified Stripe webhook event. Unhandled event types are ignored.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription) {
        return;
      }
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription, session.client_reference_id);
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    default:
      logger.debug(`Ignoring Stripe event ${event.type}`);
  }
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export function isSubscriptionActive(subscription: Pick<Subscription, 'status'> | null): boolean {
  return subscription?.status === 'active' || subscription?.status === 'trialing';
}
