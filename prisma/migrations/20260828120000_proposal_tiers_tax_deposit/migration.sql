-- Налог с продаж, уровни пакетов и сегмент объекта в коммерческом предложении.
ALTER TABLE "proposals"
  ADD COLUMN IF NOT EXISTS "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_with_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "property_type" VARCHAR(20) NOT NULL DEFAULT 'residential',
  ADD COLUMN IF NOT EXISTS "selected_tier" VARCHAR(30);

ALTER TABLE "proposal_items"
  ADD COLUMN IF NOT EXISTS "tier" VARCHAR(30);

-- Способ оплаты аванса и предел, установленный законом штата.
ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "payment_link" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_reference" VARCHAR(180),
  ADD COLUMN IF NOT EXISTS "legal_cap_amount" DECIMAL(12,2);
