CREATE TABLE "business_planning_settings" (
  "planning_key" VARCHAR(40) NOT NULL DEFAULT 'company',
  "average_deal_value" DECIMAL(12,2) NOT NULL DEFAULT 5000,
  "lead_to_deal_percent" DECIMAL(5,2) NOT NULL DEFAULT 30,
  "target_profit_monthly" DECIMAL(12,2) NOT NULL DEFAULT 50000,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_planning_settings_pkey" PRIMARY KEY ("planning_key")
);

INSERT INTO "business_planning_settings" (
  "planning_key",
  "average_deal_value",
  "lead_to_deal_percent",
  "target_profit_monthly"
) VALUES ('company', 5000, 30, 50000)
ON CONFLICT ("planning_key") DO NOTHING;
