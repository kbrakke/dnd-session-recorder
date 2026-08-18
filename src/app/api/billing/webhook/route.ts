import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { handleStripeEvent } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * POST /api/billing/webhook
 *
 * Stripe webhook receiver. PUBLIC in middleware — authentication is the
 * signature check against STRIPE_WEBHOOK_SECRET (requests are from Stripe's
 * servers, which carry no user session). Never process an event that fails
 * verification.
 *
 * Handled events: checkout.session.completed,
 * customer.subscription.updated, customer.subscription.deleted.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !isStripeConfigured()) {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Signature is computed over the raw body — read it as text, never JSON
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (err) {
    logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    logger.error(`Failed to handle Stripe event ${event.type}`, err as Error);
    // Non-2xx makes Stripe retry with backoff; handlers are idempotent
    return NextResponse.json({ error: 'Event handling failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
