-- Face ID / Touch ID sign-in keys (WebAuthn). New table only; no existing
-- rows are changed.
CREATE TABLE "passkey_credentials" (
    "passkey_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credential_id" VARCHAR(512) NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rp_id" VARCHAR(191) NOT NULL,
    "device_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("passkey_id")
);

CREATE UNIQUE INDEX "passkey_credentials_credential_id_key" ON "passkey_credentials"("credential_id");

CREATE INDEX "passkey_credentials_user_id_idx" ON "passkey_credentials"("user_id");

ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Challenges already presented for verification; the primary key makes a
-- challenge single-use even when two requests arrive at the same time.
CREATE TABLE "passkey_challenge_uses" (
    "challenge_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "passkey_challenge_uses_pkey" PRIMARY KEY ("challenge_hash")
);

CREATE INDEX "passkey_challenge_uses_expires_at_idx" ON "passkey_challenge_uses"("expires_at");
