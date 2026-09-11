-- Google Ads CRM integration - phase 1 foundation.
-- This migration only adds durable attribution, consent, conversion-event,
-- and delivery-outbox storage. It does not enable any Google upload.

CREATE TABLE "acquisition_touchpoints" (
    "acquisition_touchpoint_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "client_id" UUID,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "landing_page" TEXT,
    "utm_source" VARCHAR(255),
    "utm_medium" VARCHAR(255),
    "utm_campaign" VARCHAR(255),
    "utm_term" VARCHAR(255),
    "utm_content" VARCHAR(255),
    "session_attributes" JSONB,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acquisition_touchpoints_pkey" PRIMARY KEY ("acquisition_touchpoint_id")
);

CREATE TABLE "consent_snapshots" (
    "consent_snapshot_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "client_id" UUID,
    "ad_user_data" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    "ad_personalization" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    "audience_marketing_eligible" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(100),
    "policy_version" VARCHAR(100),
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_snapshots_pkey" PRIMARY KEY ("consent_snapshot_id")
);

CREATE TABLE "google_ads_integration_settings" (
    "setting_key" VARCHAR(40) NOT NULL DEFAULT 'default',
    "upload_enabled" BOOLEAN NOT NULL DEFAULT false,
    "validate_only" BOOLEAN NOT NULL DEFAULT true,
    "cloud_project_id" VARCHAR(64),
    "conversion_owner_customer_id" VARCHAR(64),
    "login_customer_id" VARCHAR(64),
    "qualified_lead_action_id" VARCHAR(64),
    "converted_lead_action_id" VARCHAR(64),
    "qualification_rules" JSONB,
    "sale_milestone" VARCHAR(60) NOT NULL DEFAULT 'CLOSED_WON',
    "value_basis" VARCHAR(60) NOT NULL DEFAULT 'ACTUAL_SALE_REVENUE',
    "conversion_unit" VARCHAR(40) NOT NULL DEFAULT 'DEAL',
    "currency_policy" VARCHAR(40) NOT NULL DEFAULT 'DEAL_CURRENCY',
    "attribution_policy" VARCHAR(60) NOT NULL DEFAULT 'DEAL_SELECTED_TOUCHPOINT',
    "reopened_deal_policy" VARCHAR(60) NOT NULL DEFAULT 'SAME_TRANSACTION',
    "bidding_goal" VARCHAR(60),
    "audience_rules" JSONB,
    "rule_version" VARCHAR(40) NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_ads_integration_settings_pkey" PRIMARY KEY ("setting_key")
);

CREATE TABLE "conversion_events" (
    "conversion_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "client_id" UUID,
    "deal_id" UUID,
    "business_object_type" VARCHAR(50) NOT NULL,
    "business_object_id" VARCHAR(191) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "event_source" VARCHAR(30) NOT NULL,
    "conversion_value" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL,
    "attribution_touchpoint_id" UUID,
    "transaction_id" VARCHAR(191) NOT NULL,
    "rule_version" VARCHAR(40) NOT NULL,
    "payload_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("conversion_event_id")
);

CREATE TABLE "conversion_upload_outbox" (
    "conversion_upload_outbox_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversion_event_id" UUID NOT NULL,
    "destination_account_id" VARCHAR(64) NOT NULL,
    "action_id" VARCHAR(64) NOT NULL,
    "transaction_id" VARCHAR(191) NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload_snapshot" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "request_id" VARCHAR(191),
    "processing_status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "field_warnings" JSONB,
    "last_error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_upload_outbox_pkey" PRIMARY KEY ("conversion_upload_outbox_id")
);

ALTER TABLE "deals" ADD COLUMN "attribution_touchpoint_id" UUID;

CREATE UNIQUE INDEX "conversion_events_transaction_id_key"
    ON "conversion_events"("transaction_id");
CREATE UNIQUE INDEX "conversion_events_business_object_type_business_object_id_event_type_key"
    ON "conversion_events"("business_object_type", "business_object_id", "event_type");
CREATE UNIQUE INDEX "conversion_upload_outbox_destination_account_id_action_id_transaction_id_key"
    ON "conversion_upload_outbox"("destination_account_id", "action_id", "transaction_id");

CREATE INDEX "acquisition_touchpoints_lead_id_idx" ON "acquisition_touchpoints"("lead_id");
CREATE INDEX "acquisition_touchpoints_client_id_idx" ON "acquisition_touchpoints"("client_id");
CREATE INDEX "acquisition_touchpoints_captured_at_idx" ON "acquisition_touchpoints"("captured_at");
CREATE INDEX "consent_snapshots_lead_id_idx" ON "consent_snapshots"("lead_id");
CREATE INDEX "consent_snapshots_client_id_idx" ON "consent_snapshots"("client_id");
CREATE INDEX "consent_snapshots_effective_at_idx" ON "consent_snapshots"("effective_at");
CREATE INDEX "deals_attribution_touchpoint_id_idx" ON "deals"("attribution_touchpoint_id");
CREATE INDEX "conversion_events_lead_id_idx" ON "conversion_events"("lead_id");
CREATE INDEX "conversion_events_client_id_idx" ON "conversion_events"("client_id");
CREATE INDEX "conversion_events_deal_id_idx" ON "conversion_events"("deal_id");
CREATE INDEX "conversion_events_attribution_touchpoint_id_idx" ON "conversion_events"("attribution_touchpoint_id");
CREATE INDEX "conversion_events_event_type_occurred_at_idx" ON "conversion_events"("event_type", "occurred_at");
CREATE INDEX "conversion_upload_outbox_conversion_event_id_idx" ON "conversion_upload_outbox"("conversion_event_id");
CREATE INDEX "conversion_upload_outbox_processing_status_next_retry_at_idx" ON "conversion_upload_outbox"("processing_status", "next_retry_at");

ALTER TABLE "acquisition_touchpoints"
    ADD CONSTRAINT "acquisition_touchpoints_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "acquisition_touchpoints"
    ADD CONSTRAINT "acquisition_touchpoints_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consent_snapshots"
    ADD CONSTRAINT "consent_snapshots_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consent_snapshots"
    ADD CONSTRAINT "consent_snapshots_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deals"
    ADD CONSTRAINT "deals_attribution_touchpoint_id_fkey"
    FOREIGN KEY ("attribution_touchpoint_id") REFERENCES "acquisition_touchpoints"("acquisition_touchpoint_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversion_events"
    ADD CONSTRAINT "conversion_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversion_events"
    ADD CONSTRAINT "conversion_events_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversion_events"
    ADD CONSTRAINT "conversion_events_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversion_events"
    ADD CONSTRAINT "conversion_events_attribution_touchpoint_id_fkey"
    FOREIGN KEY ("attribution_touchpoint_id") REFERENCES "acquisition_touchpoints"("acquisition_touchpoint_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversion_upload_outbox"
    ADD CONSTRAINT "conversion_upload_outbox_conversion_event_id_fkey"
    FOREIGN KEY ("conversion_event_id") REFERENCES "conversion_events"("conversion_event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
