-- Read-only Google Ads reporting cache used by CRM ROI/ROAS reporting.
-- cost_micros preserves Google's exact source metric while cost_amount keeps decimal money semantics.
CREATE TABLE "google_ads_daily_costs" (
    "google_ads_daily_cost_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" VARCHAR(64) NOT NULL,
    "segments_date" DATE NOT NULL,
    "campaign_id" VARCHAR(64) NOT NULL,
    "campaign_name" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_ads_daily_costs_pkey" PRIMARY KEY ("google_ads_daily_cost_id")
);

CREATE UNIQUE INDEX "google_ads_daily_costs_customer_id_segments_date_campaign_id_key"
    ON "google_ads_daily_costs"("customer_id", "segments_date", "campaign_id");
CREATE INDEX "google_ads_daily_costs_segments_date_idx"
    ON "google_ads_daily_costs"("segments_date");
CREATE INDEX "google_ads_daily_costs_customer_id_segments_date_idx"
    ON "google_ads_daily_costs"("customer_id", "segments_date");
