-- Owner pay rules apply to installations from 2026-09-01 (decided 2026-09-30).
-- Runs after 20260930120000_owner_rate_directory. No rows are deleted.

-- 1. Manual projects copy the service default into
--    dynamic_fields.manual_installation_cost_per_sqft at creation. Positions
--    that copied an obsolete seed default (Smart 14.00, Solar 4.25, Safety
--    5.60) and install on/after 2026-09-01 (or are not scheduled yet) get the
--    current directory rate. Genuine manual overrides (any other value) and
--    earlier installations are left unchanged.
UPDATE project_positions AS p
SET dynamic_fields = jsonb_set(
      p.dynamic_fields::jsonb,
      '{manual_installation_cost_per_sqft}',
      to_jsonb(st.installation_cost_per_sqft)
    ),
    updated_at = NOW()
FROM service_types AS st, projects AS pr
WHERE st.service_type_id = p.service_type_id
  AND pr.project_id = p.project_id
  AND (pr.install_date IS NULL OR pr.install_date >= DATE '2026-09-01')
  AND jsonb_typeof(p.dynamic_fields::jsonb -> 'manual_installation_cost_per_sqft') = 'number'
  AND (
    (st.service_code = 'SMART_FILM'  AND (p.dynamic_fields::jsonb ->> 'manual_installation_cost_per_sqft')::numeric = 14.00) OR
    (st.service_code = 'SOLAR_FILM'  AND (p.dynamic_fields::jsonb ->> 'manual_installation_cost_per_sqft')::numeric = 4.25) OR
    (st.service_code = 'SAFETY_FILM' AND (p.dynamic_fields::jsonb ->> 'manual_installation_cost_per_sqft')::numeric = 5.60)
  );

-- 2. Unpaid ("owed") accruals from 2026-09-01 are recalculated with the owner
--    rules: (sq ft × rate + Smart zones × zone rate) × difficulty. Paid
--    accruals are not rewritten; any top-up is paid as a separate payment.
UPDATE installer_payroll_accruals AS a
SET rate_per_sqft = calc.rate,
    complexity_multiplier = calc.multiplier,
    amount = ROUND((a.quantity_sqft * calc.rate + calc.zones * calc.zone_rate) * calc.multiplier, 2),
    updated_at = NOW()
FROM (
  SELECT
    j.installer_job_id,
    COALESCE(NULLIF((p.dynamic_fields::jsonb ->> 'manual_installation_cost_per_sqft'), '')::numeric, st.installation_cost_per_sqft) AS rate,
    -- Positions installed before the cutoff keep their snapshotted coefficient and get no zone pay.
    COALESCE(NULLIF((p.dynamic_fields::jsonb ->> 'complexity_multiplier'), '')::numeric, cl.multiplier, 1) AS multiplier,
    CASE WHEN st.service_code = 'SMART_FILM'
          AND (p.dynamic_fields::jsonb ->> 'owner_pay_rules') IS DISTINCT FROM 'false'
         THEN COALESCE(NULLIF((p.dynamic_fields::jsonb ->> 'zones_qty'), '')::numeric, 0)
         ELSE 0 END AS zones,
    COALESCE((SELECT installation_cost_per_sqft FROM service_types WHERE service_code = 'ZONE_CONNECTION'), 0) AS zone_rate
  FROM installer_jobs AS j
  JOIN project_positions AS p ON p.position_id = j.project_position_id
  JOIN service_types AS st ON st.service_type_id = p.service_type_id
  LEFT JOIN complexity_levels AS cl ON cl.complexity_level_id = p.complexity_level_id
) AS calc
WHERE calc.installer_job_id = a.installer_job_id
  AND a.accrued_at >= TIMESTAMPTZ '2026-09-01 00:00:00+00'
  AND a.status = 'owed';
