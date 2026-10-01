-- TASK-009: align the migration history with schema.prisma.
--
-- A clean database built only from migrations differed from schema.prisma:
-- `measurements.quantity` was used by the application but never created by a
-- migration, several foreign keys lacked ON UPDATE CASCADE, one index was
-- redundant, and long index names were truncated differently. Production may
-- already contain some of these objects (added outside migrations), so every
-- statement below is idempotent and safe on both fresh and existing databases.
-- No rows are modified or deleted.

-- Application writes measurement quantity; fresh databases lacked the column.
ALTER TABLE "measurements" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1;

-- Re-state the proposal code default in the canonical form Prisma compares.
ALTER TABLE "proposals"
  ALTER COLUMN "proposal_code"
  SET DEFAULT ('PRC-'::text || nextval('proposal_code_sequence'::regclass)::text);

-- Foreign keys: same targets and ON DELETE behaviour, plus ON UPDATE CASCADE.
ALTER TABLE "measurements" DROP CONSTRAINT IF EXISTS "measurements_project_position_id_fkey";
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_project_position_id_fkey"
  FOREIGN KEY ("project_position_id") REFERENCES "project_positions"("position_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "measurements" DROP CONSTRAINT IF EXISTS "measurements_supersedes_measurement_id_fkey";
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_supersedes_measurement_id_fkey"
  FOREIGN KEY ("supersedes_measurement_id") REFERENCES "measurements"("measurement_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "measurements" DROP CONSTRAINT IF EXISTS "measurements_recorded_by_user_id_fkey";
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_lead_intent_service_type_id_fkey";
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_intent_service_type_id_fkey"
  FOREIGN KEY ("lead_intent_service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Redundant: the unique index on the same column already serves lookups.
DROP INDEX IF EXISTS "installer_jobs_position_id_idx";

-- Rename objects to the names Prisma derives from schema.prisma.
DO $$
DECLARE
  pair TEXT[];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installer_jobs_position_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installer_jobs_project_position_id_fkey') THEN
    ALTER TABLE "installer_jobs" RENAME CONSTRAINT "installer_jobs_position_id_fkey" TO "installer_jobs_project_position_id_fkey";
  END IF;

  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['conversion_adjustment_outbox_destination_account_id_action_id_o', 'conversion_adjustment_outbox_destination_account_id_action__key'],
    ['conversion_adjustment_outbox_processing_status_next_retry_at_id', 'conversion_adjustment_outbox_processing_status_next_retry_a_idx'],
    ['conversion_adjustments_conversion_event_id_financial_reference_', 'conversion_adjustments_conversion_event_id_financial_refere_key'],
    ['conversion_events_business_object_type_business_object_id_event', 'conversion_events_business_object_type_business_object_id_e_key'],
    ['conversion_upload_outbox_destination_account_id_action_id_trans', 'conversion_upload_outbox_destination_account_id_action_id_t_key'],
    ['customer_match_memberships_destination_account_id_user_list_id_', 'customer_match_memberships_destination_account_id_user_list_key'],
    ['customer_match_outbox_customer_match_membership_id_operation_id', 'customer_match_outbox_customer_match_membership_id_operatio_key'],
    ['google_ads_daily_costs_customer_id_segments_date_campaign_id_ke', 'google_ads_daily_costs_customer_id_segments_date_campaign_i_key']
  ] LOOP
    IF to_regclass(quote_ident(pair[1])) IS NOT NULL AND to_regclass(quote_ident(pair[2])) IS NULL THEN
      EXECUTE format('ALTER INDEX %I RENAME TO %I', pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;
