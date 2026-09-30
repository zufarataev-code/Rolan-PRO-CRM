-- Owner rate directory, decided by the owner on 2026-09-30.
--
-- Installer pay per sq ft (service_types.installation_cost_per_sqft):
--   Smart 5.00 · Safety 3.00 · Solar 2.50; Smart zone connection 50.00 per zone.
-- Difficulty multipliers (complexity_levels.multiplier), applied to the whole
-- deal — client price and installer pay:
--   floor ×1.00 · ladder ×1.20 · tower/lift ×1.50 · above 10 ft ×2.00.
--
-- Until now prisma/seed.ts overwrote these columns on every production boot,
-- so the live values were the seed's (Smart 14.00, Solar 4.25, Safety 5.60;
-- ×1.20/1.30/1.50). The seed no longer overwrites them; this migration sets
-- the owner's values once. Only these columns change; no rows are deleted.

-- Positions installed before 2026-09-01 keep the coefficient and installer rate
-- they were priced and paid with: both are snapshotted into dynamic_fields
-- before the shared rows change (calculatePositionFinance prefers the snapshot).
UPDATE project_positions AS p
SET dynamic_fields = COALESCE(p.dynamic_fields::jsonb, '{}'::jsonb)
      || jsonb_build_object('manual_installation_cost_per_sqft', st.installation_cost_per_sqft),
    updated_at = NOW()
FROM projects AS pr, service_types AS st
WHERE pr.project_id = p.project_id
  AND st.service_type_id = p.service_type_id
  AND pr.install_date < DATE '2026-09-01'
  AND jsonb_typeof(p.dynamic_fields::jsonb -> 'manual_installation_cost_per_sqft') IS DISTINCT FROM 'number';

UPDATE project_positions AS p
SET dynamic_fields = COALESCE(p.dynamic_fields::jsonb, '{}'::jsonb)
      || jsonb_build_object('complexity_multiplier', cl.multiplier),
    updated_at = NOW()
FROM projects AS pr, complexity_levels AS cl
WHERE pr.project_id = p.project_id
  AND cl.complexity_level_id = p.complexity_level_id
  AND pr.install_date < DATE '2026-09-01'
  AND jsonb_typeof(p.dynamic_fields::jsonb -> 'complexity_multiplier') IS DISTINCT FROM 'number';

UPDATE service_types SET installation_cost_per_sqft = 5.00, updated_at = NOW() WHERE service_code = 'SMART_FILM';
UPDATE service_types SET installation_cost_per_sqft = 3.00, updated_at = NOW() WHERE service_code = 'SAFETY_FILM';
UPDATE service_types SET installation_cost_per_sqft = 2.50, updated_at = NOW() WHERE service_code = 'SOLAR_FILM';
UPDATE service_types SET installation_cost_per_sqft = 50.00, updated_at = NOW() WHERE service_code = 'ZONE_CONNECTION';

UPDATE complexity_levels SET multiplier = 1.00, name_ru = 'С пола', name_en = 'Floor', updated_at = NOW() WHERE level_code = 'LOW';
UPDATE complexity_levels SET multiplier = 1.20, updated_at = NOW() WHERE level_code = 'STANDARD';
UPDATE complexity_levels SET multiplier = 1.50, name_ru = 'Вышка-тура / техника', name_en = 'Tower / lift', updated_at = NOW() WHERE level_code = 'HIGH';
UPDATE complexity_levels SET multiplier = 2.00, name_ru = 'Выше 10 футов', name_en = 'Above 10 ft', updated_at = NOW() WHERE level_code = 'EXPERT';
