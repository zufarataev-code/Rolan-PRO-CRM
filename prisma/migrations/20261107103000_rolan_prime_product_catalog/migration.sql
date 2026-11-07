ALTER TABLE "film_catalog"
ADD COLUMN "series_name" VARCHAR(120),
ADD COLUMN "material_code" VARCHAR(80),
ADD COLUMN "additional_category_codes" JSONB,
ADD COLUMN "roll_widths_in" JSONB,
ADD COLUMN "roll_length_ft" DECIMAL(8,2),
ADD COLUMN "use_case_ru" TEXT,
ADD COLUMN "privacy_note_ru" TEXT,
ADD COLUMN "spec_status" VARCHAR(80),
ADD COLUMN "technical_specs" JSONB;

-- Preserve historical references while removing superseded own-brand
-- placeholders from new Project selectors.
UPDATE "film_catalog"
SET "is_active" = FALSE
WHERE "model_code" IN ('A1', 'A2', 'A3');

-- Model codes are customer-facing SP codes. Project references use film_id,
-- so the stable identity of existing rows is preserved.
UPDATE "film_catalog" SET "model_code" = 'SP05' WHERE "model_code" = 'MP05';
UPDATE "film_catalog" SET "model_code" = 'SP15' WHERE "model_code" = 'MP15';
UPDATE "film_catalog" SET "model_code" = 'SP20' WHERE "model_code" = 'MP20';
UPDATE "film_catalog" SET "model_code" = 'SP35' WHERE "model_code" = 'MP35';
UPDATE "film_catalog" SET "model_code" = 'SP50' WHERE "model_code" = 'MP50';
UPDATE "film_catalog" SET "model_code" = 'SP70' WHERE "model_code" = 'MP70';
