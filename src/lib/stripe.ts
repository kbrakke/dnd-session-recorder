import Stripe from 'stripe';

/**
 * Managed Payments (Stripe as merchant of record, automatic tax) is a preview
 * feature: the product-create and checkout-session calls must send this
 * version header per request. The client itself is deliberately not pinned to
 * an API version — it uses the SDK's default.
 */
export const STRIPE_PREVIEW_API_VERSION = '2026-02-25.preview';

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Lazy singleton Stripe client. Throws if STRIPE_SECRET_KEY is unset — call
 * isStripeConfigured() first on paths that should degrade gracefully.
 */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}
