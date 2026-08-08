ALTER TABLE "service_types"
  ADD COLUMN "base_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "min_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "material_cost_per_sqft" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "installation_cost_per_sqft" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "block_revenue_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "block_cost_price" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "service_addons"
  ADD COLUMN "min_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "cost_price" DECIMAL(12, 2) NOT NULL DEFAULT 0;
