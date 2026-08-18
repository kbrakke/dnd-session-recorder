#!/usr/bin/env tsx
/**
 * One-time Stripe setup: creates the "Basic subscription" product ($10/month,
 * digital-goods tax code for Managed Payments) in the account that
 * STRIPE_SECRET_KEY points at, or finds the one this app already created.
 * Prints the price id to pin as STRIPE_PRICE_ID.
 *
 * Idempotent: products are tagged with metadata `app=dnd-session-recorder`
 * and reused on re-runs. (The app also lazy-creates this on first checkout —
 * the script just lets you pin STRIPE_PRICE_ID explicitly per environment.)
 *
 * Usage:
 *   set -a && source .env && set +a   # or export STRIPE_SECRET_KEY=rk_...
 *   npx tsx scripts/stripe-setup.ts
 */

import Stripe from 'stripe';
import { exit } from 'process';

// Keep in sync with src/services/billing.ts
const PRODUCT_METADATA_KEY = 'app';
const PRODUCT_METADATA_VALUE = 'dnd-session-recorder';
const STRIPE_PREVIEW_API_VERSION = '2026-02-25.preview';

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('STRIPE_SECRET_KEY is not set.');
    console.error('Get a restricted key (rk_...) from the Stripe Dashboard → Developers → API keys,');
    console.error('add it to .env, then run: set -a && source .env && set +a && npx tsx scripts/stripe-setup.ts');
    exit(1);
  }

  const stripe = new Stripe(key);

  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (p) => p.metadata[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE && p.default_price
  );
  if (existing) {
    const priceId =
      typeof existing.default_price === 'string'
        ? existing.default_price
        : (existing.default_price as Stripe.Price).id;
    console.log(`Found existing product: ${existing.id} (${existing.name})`);
    console.log(`\nAdd to your environment:\nSTRIPE_PRICE_ID="${priceId}"`);
    return;
  }

  const product = await stripe.products.create(
    {
      name: 'Basic subscription',
      description: 'A basic subscription to our service',
      tax_code: 'txcd_10103100',
      default_price_data: {
        unit_amount: 1000,
        currency: 'usd',
        recurring: { interval: 'month' },
      },
      metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
    },
    { apiVersion: STRIPE_PREVIEW_API_VERSION }
  );

  console.log(`Created product: ${product.id} (${product.name})`);
  console.log(`\nAdd to your environment:\nSTRIPE_PRICE_ID="${product.default_price}"`);
}

main().catch((err) => {
  console.error('Stripe setup failed:', err.message);
  exit(1);
});
