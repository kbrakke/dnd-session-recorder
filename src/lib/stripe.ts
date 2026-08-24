import Stripe from 'stripe';

/**
 * Managed Payments (Stripe as merchant of record, automatic tax) is a preview
 * feature: the product-create and checkout-session calls must send this
 * version header per request. The client itself is deliberately not pinned to
 * an API version — it uses the SDK's default.
 */
export const STRIPE_PREVIEW_API_VERSION = '2026-02-25.preview';

// The single subscription product this app sells. Identified in Stripe by
// metadata so re-deploys and multiple environments don't create duplicates.
// Shared by the runtime (src/services/billing.ts) and scripts/stripe-setup.ts
// so the two can never drift apart.
export const PRODUCT_METADATA_KEY = 'app';
export const PRODUCT_METADATA_VALUE = 'dnd-session-recorder';

export const SUBSCRIPTION_PRODUCT: Stripe.ProductCreateParams = {
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

/**
 * Find the app's tagged product, auto-paginating past the per-page cap so a
 * Stripe account with >100 active products can't hide it. Returns the product
 * and its default price id, or null when absent.
 */
export async function findSubscriptionProduct(
  stripe: Stripe
): Promise<{ product: Stripe.Product; priceId: string } | null> {
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (
      product.metadata[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE &&
      product.default_price
    ) {
      return {
        product,
        priceId:
          typeof product.default_price === 'string'
            ? product.default_price
            : (product.default_price as Stripe.Price).id,
      };
    }
  }
  return null;
}

/**
 * Create the subscription product (with its default price). The idempotency
 * key collapses concurrent creates — e.g. two cold machines racing on their
 * first checkout — into a single product.
 */
export async function createSubscriptionProduct(stripe: Stripe): Promise<Stripe.Product> {
  return stripe.products.create(SUBSCRIPTION_PRODUCT, {
    apiVersion: STRIPE_PREVIEW_API_VERSION,
    idempotencyKey: `product-create-${PRODUCT_METADATA_VALUE}`,
  });
}

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
