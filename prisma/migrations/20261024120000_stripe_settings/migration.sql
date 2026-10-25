-- The owner enters the Stripe key in CRM settings; it is stored encrypted and
-- never sent back to the browser. STRIPE_SECRET_KEY on the server still wins.
CREATE TABLE IF NOT EXISTS "stripe_settings" (
  "settings_id" VARCHAR(20) NOT NULL DEFAULT 'primary',
  "secret_encrypted" TEXT NOT NULL,
  "key_hint" VARCHAR(16) NOT NULL,
  "mode" VARCHAR(10) NOT NULL DEFAULT 'test',
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "stripe_settings_pkey" PRIMARY KEY ("settings_id")
);
