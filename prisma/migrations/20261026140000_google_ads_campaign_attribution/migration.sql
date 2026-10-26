ALTER TABLE "acquisition_touchpoints"
  ADD COLUMN "google_ads_customer_id" VARCHAR(20),
  ADD COLUMN "google_ads_campaign_id" VARCHAR(64),
  ADD COLUMN "legacy_order_id" VARCHAR(120);

CREATE UNIQUE INDEX "acquisition_touchpoints_legacy_order_id_key"
  ON "acquisition_touchpoints"("legacy_order_id");
CREATE INDEX "acquisition_touchpoints_google_ads_campaign_idx"
  ON "acquisition_touchpoints"("google_ads_customer_id", "google_ads_campaign_id", "captured_at");

ALTER TABLE "deals" ADD COLUMN "legacy_order_id" VARCHAR(120);
CREATE INDEX "deals_legacy_order_id_idx" ON "deals"("legacy_order_id");

-- Backfill only the exact import marker written by publishLegacyProposal.
UPDATE "deals" SET "legacy_order_id" = substring("notes" from '^Imported from legacy order (.+)\.$')
WHERE "legacy_order_id" IS NULL AND "notes" ~ '^Imported from legacy order (.+)\.$';
