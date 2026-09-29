-- TASK-009: repair Safety Film field configs created under Smart Film.
--
-- prisma/seed.ts upserted Safety Film fields with `where: SAFETY_FILM` but
-- `create: SMART_FILM`. On any database where a Safety Film field was missing,
-- the seed created it under Smart Film instead, adding safety-only fields
-- (silicone perimeter, risk zones, frame type, ...) to the Smart Film survey.
--
-- Repair: move a safety-only field from Smart Film to Safety Film only when
-- Safety Film does not already have that field. Nothing is deleted. If both
-- exist, the Smart Film copy is left untouched and reported for manual review.
-- service_field_config has no inbound foreign keys, so moving a row is safe.

DO $$
DECLARE
  smart_id UUID;
  safety_id UUID;
  moved INTEGER;
  leftover TEXT;
  safety_only_keys TEXT[] := ARRAY[
    'thickness', 'windows_qty', 'risk_zones', 'silicone_perimeter_m', 'frame_type', 'glass_type'
  ];
BEGIN
  SELECT service_type_id INTO smart_id FROM service_types WHERE service_code = 'SMART_FILM';
  SELECT service_type_id INTO safety_id FROM service_types WHERE service_code = 'SAFETY_FILM';

  IF smart_id IS NULL OR safety_id IS NULL THEN
    RAISE NOTICE 'Service types not present; nothing to repair.';
    RETURN;
  END IF;

  UPDATE service_field_config AS f
  SET service_type_id = safety_id
  WHERE f.service_type_id = smart_id
    AND f.field_key = ANY (safety_only_keys)
    AND NOT EXISTS (
      SELECT 1 FROM service_field_config s
      WHERE s.service_type_id = safety_id AND s.field_key = f.field_key
    );
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'Moved % Safety Film field(s) out of Smart Film.', moved;

  SELECT string_agg(field_key, ', ') INTO leftover
  FROM service_field_config
  WHERE service_type_id = smart_id AND field_key = ANY (safety_only_keys);
  IF leftover IS NOT NULL THEN
    RAISE NOTICE 'Smart Film still has safety-only field(s) needing manual review: %', leftover;
  END IF;
END $$;
