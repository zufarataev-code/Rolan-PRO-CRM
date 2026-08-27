-- Оптические параметры и совместимость с остеклением для подбора плёнки.
ALTER TABLE "film_catalog"
  ADD COLUMN IF NOT EXISTS "vlt_percent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "uv_rejection_percent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "ir_rejection_percent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "tser_percent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "allowed_glass_types" JSONB,
  ADD COLUMN IF NOT EXISTS "restricted_orientations" JSONB,
  ADD COLUMN IF NOT EXISTS "requires_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "selection_note_ru" TEXT;

-- Ранее отсутствовавшая колонка: описана в схеме, но не создавалась миграцией.
-- Из-за этого падала страница владельца.
ALTER TABLE "schedule_assignments"
  ADD COLUMN IF NOT EXISTS "planning_tags" JSONB;
