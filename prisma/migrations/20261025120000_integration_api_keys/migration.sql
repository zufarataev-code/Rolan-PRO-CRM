-- Owner, 2026-10-25: a CRM key for an outside service (first: the Google Ads
-- script that sends daily campaign costs). Only a SHA-256 hash is stored; the
-- key itself is shown once, when it is created.
CREATE TABLE IF NOT EXISTS "integration_api_keys" (
  "key_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "integration" VARCHAR(40) NOT NULL,
  "key_hash" CHAR(64) NOT NULL,
  "key_prefix" VARCHAR(16) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("key_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_api_keys_key_hash_key" ON "integration_api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "integration_api_keys_integration_idx" ON "integration_api_keys"("integration");
