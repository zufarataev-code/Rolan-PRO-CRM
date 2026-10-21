-- Кассовая логика создания проекта: справочники.
--
-- Плёнка: тип внутри направления, класс standard/premium, коридор цены за sq ft
-- (ниже min сервер не продаёт), ширины рулонов и припуск для раскроя.
ALTER TABLE "film_catalog"
  ADD COLUMN IF NOT EXISTS "film_type_code" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "film_class" VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "price_per_sqft" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "min_price_per_sqft" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "max_price_per_sqft" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "roll_widths_in" JSONB,
  ADD COLUMN IF NOT EXISTS "cutting_margin_in" DECIMAL(5,2) NOT NULL DEFAULT 1;

-- Услуга направления: свой цвет во всей CRM и подсказка «обычно идёт вместе с».
ALTER TABLE "service_addons"
  ADD COLUMN IF NOT EXISTS "color_token" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "suggested_with_addon_codes" JSONB;

-- Доступ к окну: коэффициент к монтажной части, техника отдельной строкой.
CREATE TABLE IF NOT EXISTS "access_levels" (
  "access_level_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "access_code" VARCHAR(50) NOT NULL,
  "name_ru" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(120) NOT NULL,
  "min_height_ft" DECIMAL(6,2),
  "max_height_ft" DECIMAL(6,2),
  "labor_coefficient" DECIMAL(6,2) NOT NULL DEFAULT 1,
  "equipment_name_ru" VARCHAR(120),
  "equipment_day_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "is_contractor" BOOLEAN NOT NULL DEFAULT false,
  "color_token" VARCHAR(50),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "access_levels_pkey" PRIMARY KEY ("access_level_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "access_levels_access_code_key" ON "access_levels"("access_code");

-- Замер: створки, стекло двумя полями, доступ, услуги на окне, плёнка окна.
ALTER TABLE "measurements"
  ADD COLUMN IF NOT EXISTS "sash_layout_code" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "sash_cols" INTEGER,
  ADD COLUMN IF NOT EXISTS "sash_rows" INTEGER,
  ADD COLUMN IF NOT EXISTS "glass_finish_code" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "pane_structure_code" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "access_code" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "removal_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "silicone_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "film_id" UUID;
CREATE INDEX IF NOT EXISTS "measurements_film_id_idx" ON "measurements"("film_id");
DO $$ BEGIN
  ALTER TABLE "measurements"
    ADD CONSTRAINT "measurements_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film_catalog"("film_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
