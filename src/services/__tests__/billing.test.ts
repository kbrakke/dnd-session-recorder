import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

// The service touches Prisma and the Stripe client; mock both so these stay
// pure-logic unit tests (dispatch routing, idempotent upsert keying, status).
// Defined via vi.hoisted so the hoisted vi.mock factories can close over them.
const { prismaMock, stripeMock } = vi.hoisted(() => ({
  prismaMock: {
    subscription: { upsert: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  stripeMock: {
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => stripeMock,
  STRIPE_PREVIEW_API_VERSION: '2026-02-25.preview',
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  handleStripeEvent,
  syncSubscription,
  isSubscriptionActive,
} from '@/services/billing';

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: 'user_1' },
    items: { data: [{ price: { id: 'price_1' }, current_period_end: 1_700_000_000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('isSubscriptionActive', () => {
  it('treats active and trialing as active, everything else as inactive', () => {
    expect(isSubscriptionActive({ status: 'active' })).toBe(true);
    expect(isSubscriptionActive({ status: 'trialing' })).toBe(true);
    expect(isSubscriptionActive({ status: 'past_due' })).toBe(false);
    expect(isSubscriptionActive({ status: 'canceled' })).toBe(false);
    expect(isSubscriptionActive(null)).toBe(false);
  });
});

describe('syncSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts keyed by stripeSubscriptionId (idempotent on replay)', async () => {
    await syncSubscription(subscription());

    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.subscription.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ stripeSubscriptionId: 'sub_1' });
    expect(arg.create.userId).toBe('user_1');
    expect(arg.create.status).toBe('active');
    // Billing period comes from the item, not the subscription object
    expect(arg.create.currentPeriodEnd).toEqual(new Date(1_700_000_000 * 1000));
    expect(arg.update.status).toBe('active');
  });

  it('falls back to the customer lookup when metadata has no userId', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'user_from_customer' });

    await syncSubscription(subscription({ metadata: {} }));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_1' },
      select: { id: true },
    });
    expect(prismaMock.subscription.upsert.mock.calls[0][0].create.userId).toBe('user_from_customer');
  });

  it('skips the upsert when no user can be resolved', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await syncSubscription(subscription({ metadata: {} }));

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('handleStripeEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retrieves then syncs the subscription on checkout.session.completed', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(subscription());

    await handleStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: 'user_1' },
      },
    } as unknown as Stripe.Event);

    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-subscription checkout session', async () => {
    await handleStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', subscription: null } },
    } as unknown as Stripe.Event);

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('syncs directly on customer.subscription.updated/deleted', async () => {
    await handleStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: subscription({ status: 'canceled' }) },
    } as unknown as Stripe.Event);

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert.mock.calls[0][0].update.status).toBe('canceled');
  });

  it('ignores unhandled event types', async () => {
    await handleStripeEvent({
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    } as unknown as Stripe.Event);

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});
