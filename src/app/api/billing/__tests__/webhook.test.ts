import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';

vi.mock('@/services/billing', () => ({
  handleStripeEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '../webhook/route';
import { handleStripeEvent } from '@/services/billing';

const WEBHOOK_SECRET = 'whsec_test_secret';

// Only used offline: signature generation and verification, no API calls
const stripe = new Stripe('sk_test_dummy');

function checkoutCompletedPayload(): string {
  return JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        mode: 'subscription',
        subscription: 'sub_test_1',
        client_reference_id: 'user_1',
      },
    },
  });
}

function webhookRequest(payload: string, signature?: string): Request {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    body: payload,
    headers: signature ? { 'stripe-signature': signature } : {},
  });
}

function signedHeader(payload: string, secret = WEBHOOK_SECRET): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

describe('POST /api/billing/webhook', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 503 when the webhook secret is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(webhookRequest(checkoutCompletedPayload()));
    expect(res.status).toBe(503);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(webhookRequest(checkoutCompletedPayload()));
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the signature does not match the payload', async () => {
    const payload = checkoutCompletedPayload();
    const res = await POST(webhookRequest(payload, signedHeader(payload, 'whsec_wrong_secret')));
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the payload was tampered with after signing', async () => {
    const signature = signedHeader(checkoutCompletedPayload());
    const tampered = checkoutCompletedPayload().replace('user_1', 'attacker');
    const res = await POST(webhookRequest(tampered, signature));
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it('dispatches a correctly signed event and returns 200', async () => {
    const payload = checkoutCompletedPayload();
    const res = await POST(webhookRequest(payload, signedHeader(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(handleStripeEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(handleStripeEvent).mock.calls[0][0];
    expect(event.type).toBe('checkout.session.completed');
  });

  it('returns 500 (so Stripe retries) when event handling fails', async () => {
    vi.mocked(handleStripeEvent).mockRejectedValueOnce(new Error('db down'));
    const payload = checkoutCompletedPayload();
    const res = await POST(webhookRequest(payload, signedHeader(payload)));
    expect(res.status).toBe(500);
  });
});
