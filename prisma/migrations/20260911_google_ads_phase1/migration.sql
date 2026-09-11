-- AcquisitionTouchpoint table
CREATE TABLE "acquisition_touchpoints" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "gclid" VARCHAR(100),
    "gbraid" VARCHAR(100),
    "wbraid" VARCHAR(100),
    "landing_page" TEXT,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "utm_term" VARCHAR(100),
    "utm_content" VARCHAR(100),
    "session_attributes" JSONB,
    "captured_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

-- ConsentSnapshot table
CREATE TABLE "consent_snapshots" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ad_user_data" VARCHAR(50),
    "ad_personalization" VARCHAR(50),
    "audience_eligibility" BOOLEAN,
    "source" VARCHAR(100),
    "policy_version" VARCHAR(50),
    "effective_at" TIMESTAMPTZ,
    "captured_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

-- GoogleAdsIntegrationSetting table
CREATE TABLE "google_ads_integration_settings" (
    "id" VARCHAR(100) PRIMARY KEY DEFAULT 'google_ads',
    "upload_enabled" BOOLEAN DEFAULT false,
    "validate_only" BOOLEAN DEFAULT true,
    "cloud_project_id" VARCHAR(100),
    "conversion_owner_id" VARCHAR(100),
    "login_customer_id" VARCHAR(100),
    "qualified_lead_action_id" VARCHAR(100),
    "converted_lead_action_id" VARCHAR(100),
    "qualified_stage_rules" VARCHAR(255),
    "sale_milestone_rules" VARCHAR(255),
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- ConversionEvent table
CREATE TABLE "conversion_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_id" VARCHAR(100) UNIQUE,
    "object_type" VARCHAR(50),
    "object_id" UUID,
    "event_type" VARCHAR(50),
    "occurred_at" TIMESTAMPTZ,
    "event_source" VARCHAR(100),
    "conversion_value" DECIMAL(12, 2),
    "currency" VARCHAR(3),
    "attribution_touchpoint_id" UUID,
    "transaction_id" VARCHAR(100),
    "rule_version" VARCHAR(50),
    "payload_snapshot" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "unique_on_dest" VARCHAR(100) UNIQUE
);

-- ConversionUploadOutbox table
CREATE TABLE "conversion_upload_outboxes" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_id" UUID,
    "destination_id" VARCHAR(100),
    "login_id" VARCHAR(100),
    "action_id" VARCHAR(100),
    "transaction_id" VARCHAR(100),
    "attempts" INT DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "request_id" VARCHAR(100),
    "status" VARCHAR(50),
    "warnings" JSONB,
    "errors" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "updated_at" TIMESTAMPTZ DEFAULT now(),
    UNIQUE ("destination_id", "action_id", "transaction_id")
);
