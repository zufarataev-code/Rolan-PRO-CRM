-- Owner, 2026-10-25 (Google Ads CRM integration spec): the owner pastes the
-- Google Cloud service-account key in CRM settings; the private key is stored
-- encrypted (AES-256-GCM, same envelope as bank and Stripe keys). Server env
-- credentials still win when present.
CREATE TABLE IF NOT EXISTS "google_ads_credentials" (
  "settings_id" VARCHAR(20) NOT NULL DEFAULT 'primary',
  "service_account_email" VARCHAR(255) NOT NULL,
  "private_key_encrypted" TEXT NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "google_ads_credentials_pkey" PRIMARY KEY ("settings_id")
);
