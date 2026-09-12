-- Extended google_ads_integration_settings with Customer Match fields.
ALTER TABLE "google_ads_integration_settings"
ADD COLUMN "customer_match_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customer_match_user_list_id" VARCHAR(64),
ADD COLUMN "customer_match_terms_accepted" BOOLEAN NOT NULL DEFAULT false;

-- Created customer_match_memberships table to track Customer Match memberships.
CREATE TABLE "customer_match_memberships" (
    "customer_match_membership_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" VARCHAR(20) NOT NULL,
    "subject_id" UUID NOT NULL,
    "destination_account_id" VARCHAR(64) NOT NULL,
    "user_list_id" VARCHAR(64) NOT NULL,
    "desired_state" VARCHAR(20) NOT NULL DEFAULT 'REMOVED',
    "desired_identifier_version" VARCHAR(64),
    "desired_identifier_snapshot" JSONB,
    "applied_state" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    "applied_identifier_version" VARCHAR(64),
    "applied_identifier_snapshot" JSONB,
    "rule_version" VARCHAR(40) NOT NULL DEFAULT 'v1',
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("customer_match_membership_id")
);
CREATE UNIQUE INDEX ON "customer_match_memberships" ("destination_account_id", "user_list_id", "subject_type", "subject_id");
CREATE INDEX ON "customer_match_memberships" ("desired_state", "applied_state");
CREATE INDEX ON "customer_match_memberships" ("subject_type", "subject_id");

-- Created customer_match_outbox table to track operations on Customer Match memberships.
CREATE TABLE "customer_match_outbox" (
    "customer_match_outbox_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_match_membership_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "identifier_version" VARCHAR(64) NOT NULL,
    "identifier_snapshot" JSONB NOT NULL,
    "processing_status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "request_id" VARCHAR(191),
    "last_error" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("customer_match_outbox_id")
);
CREATE UNIQUE INDEX ON "customer_match_outbox" ("customer_match_membership_id", "operation", "identifier_version");
CREATE INDEX ON "customer_match_outbox" ("processing_status", "next_retry_at");
CREATE INDEX ON "customer_match_outbox" ("customer_match_membership_id");

-- Adding required foreign key constraint for customer_match_outbox referring to customer_match_memberships.
ALTER TABLE "customer_match_outbox"
ADD CONSTRAINT "customer_match_outbox_membership_id_fkey"
FOREIGN KEY ("customer_match_membership_id")
REFERENCES "customer_match_memberships" ("customer_match_membership_id")
ON DELETE CASCADE ON UPDATE CASCADE;
