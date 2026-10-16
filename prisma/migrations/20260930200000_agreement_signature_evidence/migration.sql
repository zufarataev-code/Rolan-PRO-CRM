-- Client e-signature evidence on the public proposal (2026-09-30):
-- the drawn signature (PNG data URL) and where it was signed from.
-- Nullable columns; existing agreements are unchanged.
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "signature_image" TEXT;
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "signer_ip" VARCHAR(64);
ALTER TABLE "agreements" ADD COLUMN IF NOT EXISTS "signer_user_agent" VARCHAR(400);
