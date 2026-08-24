import Stripe from 'stripe';
import type { Subscription } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getStripe,
  STRIPE_PREVIEW_API_VERSION,
  findSubscriptionProduct,
  createSubscriptionProduct,
} from '@/lib/stripe';
import { logger } from '@/lib/logger';

// A TTL bounds how long an archived/repriced product keeps being sold from a
// stale per-process cache
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPrice: { id: string; expiresAt: number } | null = null;

/**
 * Resolve the monthly price to sell. Precedence: STRIPE_PRICE_ID env var,
 * then an existing product tagged with our metadata, then create the product
 * (with its default price) per the Managed Payments setup.
 */
export async function ensureSubscriptionPrice(): Promise<string> {
  if (process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }
  if (cachedPrice && Date.now() < cachedPrice.expiresAt) {
    return cachedPrice.id;
  }

  const stripe = getStripe();
  const found = await findSubscriptionProduct(stripe);
  let priceId: string;
  if (found) {
    priceId = found.priceId;
  } else {
    const product = await createSubscriptionProduct(stripe);
    logger.info(`Created Stripe subscription product ${product.id}`);
    priceId = product.default_price as string;
  }
  cachedPrice = { id: priceId, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
  return priceId;
}

export interface SubscriptionPriceInfo {
  unitAmount: number | null;
  currency: string;
  interval: string | null;
  productName: string | null;
}

let cachedPriceInfo: { info: SubscriptionPriceInfo; expiresAt: number } | null = null;

/**
 * The resolved price as display data for the billing page, so the UI never
 * hardcodes an amount that STRIPE_PRICE_ID (or a product edit) can change.
 */
export async function getSubscriptionPriceInfo(): Promise<SubscriptionPriceInfo> {
  if (cachedPriceInfo && Date.now() < cachedPriceInfo.expiresAt) {
    return cachedPriceInfo.info;
  }

  const priceId = await ensureSubscriptionPrice();
  const price = await getStripe().prices.retrieve(priceId, { expand: ['product'] });
  const info: SubscriptionPriceInfo = {
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval ?? null,
    productName:
      typeof price.product === 'object' && 'name' in price.product ? price.product.name : null,
  };
  cachedPriceInfo = { info, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
  return info;
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

  const customer = await getStripe().customers.create(
    {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId },
    },
    // Concurrent first checkouts (double-click, second tab) collapse to one
    // customer instead of racing to create duplicates
    { idempotencyKey: `customer-create-${userId}` }
  );
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
 * idempotent. Out-of-order delivery is handled by callers passing freshly
 * retrieved state, not stale event payloads (see handleStripeEvent).
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  let userId = subscription.metadata?.userId || fallbackUserId || null;
  if (userId) {
    // The id may reference a hard-deleted user whose Stripe subscription
    // lives on; an unchecked id would hit the FK on the create path and make
    // the webhook 500 (and Stripe retry) forever
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      userId = null;
    }
  }
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
      // Stripe doesn't guarantee delivery order, so the event payload may be
      // stale (e.g. an old 'active' update delivered after the deletion) —
      // re-retrieve so we always sync the subscription's current state
      const eventSubscription = event.data.object as Stripe.Subscription;
      const subscription = await getStripe().subscriptions.retrieve(eventSubscription.id);
      await syncSubscription(subscription);
      break;
    }
    default:
      logger.debug(`Ignoring Stripe event ${event.type}`);
  }
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  // An active/trialing row always wins — a newer canceled/incomplete row must
  // not shadow a subscription Stripe is still billing
  const active = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) {
    return active;
  }
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export function isSubscriptionActive(subscription: Pick<Subscription, 'status'> | null): boolean {
  return subscription?.status === 'active' || subscription?.status === 'trialing';
}
