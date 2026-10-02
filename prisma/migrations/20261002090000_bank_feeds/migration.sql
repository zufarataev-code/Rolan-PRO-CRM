-- Bank and card feeds through Plaid (Owner, 2026-10-02): keys entered by the
-- owner (secret encrypted), connected bank logins (access token encrypted),
-- accounts with balances, operations with categories, and learned rules.
CREATE TABLE IF NOT EXISTS "plaid_settings" (
  "settings_id" VARCHAR(20) NOT NULL DEFAULT 'primary',
  "client_id" VARCHAR(120) NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "environment" VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plaid_settings_pkey" PRIMARY KEY ("settings_id")
);

CREATE TABLE IF NOT EXISTS "bank_connections" (
  "connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plaid_item_id" VARCHAR(120) NOT NULL,
  "environment" VARCHAR(20) NOT NULL,
  "institution_id" VARCHAR(60),
  "institution_name" VARCHAR(160),
  "access_token_encrypted" TEXT NOT NULL,
  "transactions_cursor" TEXT,
  "status" VARCHAR(30) NOT NULL DEFAULT 'active',
  "error_code" VARCHAR(80),
  "last_synced_at" TIMESTAMPTZ(6),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("connection_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_plaid_item_id_key" ON "bank_connections"("plaid_item_id");

CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "account_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "plaid_account_id" VARCHAR(120) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "official_name" VARCHAR(200),
  "mask" VARCHAR(10),
  "type" VARCHAR(30) NOT NULL,
  "subtype" VARCHAR(40),
  "current_balance" DECIMAL(14,2),
  "available_balance" DECIMAL(14,2),
  "credit_limit" DECIMAL(14,2),
  "iso_currency" VARCHAR(3),
  "balance_updated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("account_id"),
  CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("connection_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_plaid_account_id_key" ON "bank_accounts"("plaid_account_id");
CREATE INDEX IF NOT EXISTS "bank_accounts_connection_id_idx" ON "bank_accounts"("connection_id");

CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "transaction_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plaid_transaction_id" VARCHAR(120) NOT NULL,
  "account_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "authorized_date" DATE,
  "name" VARCHAR(300) NOT NULL,
  "merchant_name" VARCHAR(200),
  "amount" DECIMAL(14,2) NOT NULL,
  "iso_currency" VARCHAR(3),
  "pending" BOOLEAN NOT NULL DEFAULT false,
  "plaid_category" VARCHAR(80),
  "plaid_category_detail" VARCHAR(120),
  "category_code" VARCHAR(40),
  "review_status" VARCHAR(20) NOT NULL DEFAULT 'needs_review',
  "rule_id" UUID,
  "note" TEXT,
  "removed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("transaction_id"),
  CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("account_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_plaid_transaction_id_key" ON "bank_transactions"("plaid_transaction_id");
CREATE INDEX IF NOT EXISTS "bank_transactions_account_id_date_idx" ON "bank_transactions"("account_id", "date");
CREATE INDEX IF NOT EXISTS "bank_transactions_review_status_idx" ON "bank_transactions"("review_status");

CREATE TABLE IF NOT EXISTS "bank_category_rules" (
  "rule_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pattern" VARCHAR(200) NOT NULL,
  "category_code" VARCHAR(40) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_category_rules_pkey" PRIMARY KEY ("rule_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_category_rules_pattern_key" ON "bank_category_rules"("pattern");
