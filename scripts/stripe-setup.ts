#!/usr/bin/env tsx
/**
 * One-time Stripe setup: creates the "Basic subscription" product ($10/month,
 * digital-goods tax code for Managed Payments) in the account that
 * STRIPE_SECRET_KEY points at, or finds the one this app already created.
 * Prints the price id to pin as STRIPE_PRICE_ID.
 *
 * Idempotent: products are tagged with metadata `app=dnd-session-recorder`
 * and reused on re-runs. The product definition and lookup live in
 * src/lib/stripe.ts, shared with the app runtime (which lazy-creates the same
 * product on first checkout) — the script just lets you pin STRIPE_PRICE_ID
 * explicitly per environment.
 *
 * Usage:
 *   set -a && source .env && set +a   # or export STRIPE_SECRET_KEY=rk_...
 *   npx tsx scripts/stripe-setup.ts
 */

import Stripe from 'stripe';
import { exit } from 'process';
import { findSubscriptionProduct, createSubscriptionProduct } from '../src/lib/stripe';

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('STRIPE_SECRET_KEY is not set.');
    console.error('Get a restricted key (rk_...) from the Stripe Dashboard → Developers → API keys,');
    console.error('add it to .env, then run: set -a && source .env && set +a && npx tsx scripts/stripe-setup.ts');
    exit(1);
  }

  const stripe = new Stripe(key);

  const existing = await findSubscriptionProduct(stripe);
  if (existing) {
    console.log(`Found existing product: ${existing.product.id} (${existing.product.name})`);
    console.log(`\nAdd to your environment:\nSTRIPE_PRICE_ID="${existing.priceId}"`);
    return;
  }

  const product = await createSubscriptionProduct(stripe);
  console.log(`Created product: ${product.id} (${product.name})`);
  console.log(`\nAdd to your environment:\nSTRIPE_PRICE_ID="${product.default_price}"`);
}

main().catch((err) => {
  console.error('Stripe setup failed:', err.message);
  exit(1);
});
