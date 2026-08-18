-- Stripe billing: customer id on User + subscriptions mirror table.
-- Guarded so partial/manual recovery states don't wedge the migration.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_price_id" TEXT,
    "status" TEXT NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripe_customer_id_key" ON "User"("stripe_customer_id");

-- AddForeignKey (no IF NOT EXISTS for constraints; guard via catalog check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey'
  ) THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
