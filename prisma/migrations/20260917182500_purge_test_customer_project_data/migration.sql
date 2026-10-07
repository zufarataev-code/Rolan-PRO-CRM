-- Authorized one-time cleanup before ROLANPRO begins entering live customer data.
-- Scope: customer / sales / project operational records only.
-- Preserve: users/auth, team, services/pricing, film catalog, warehouse/reference data,
-- integrations and independent employee work sessions.

BEGIN;

-- Freeze the customer/project core while the snapshot and cleanup run so a live
-- request cannot create a new record between DELETEs and postcondition checks.
LOCK TABLE
  leads,
  clients,
  deals,
  projects,
  proposals,
  consultations,
  surveys,
  measurements,
  project_positions,
  installer_jobs,
  legacy_workspaces,
  installer_location_points,
  installer_work_sessions,
  installer_payroll_accruals,
  documents,
  attachments_files,
  proposal_events,
  agreements,
  deposits,
  proposal_items,
  survey_recommendations,
  schedule_assignments,
  project_position_addons,
  calendar_events,
  follow_ups,
  tasks,
  activity_log,
  notifications,
  email_actions,
  gmail_messages,
  twilio_messages
IN ACCESS EXCLUSIVE MODE;

LOCK TABLE
  users,
  user_access,
  service_types,
  service_addons,
  film_catalog,
  crews
IN SHARE MODE;

CREATE TEMP TABLE _purge_leads ON COMMIT DROP AS
SELECT lead_id FROM leads;

CREATE TEMP TABLE _purge_clients ON COMMIT DROP AS
SELECT client_id FROM clients;

CREATE TEMP TABLE _purge_deals ON COMMIT DROP AS
SELECT deal_id FROM deals;

CREATE TEMP TABLE _purge_projects ON COMMIT DROP AS
SELECT project_id FROM projects;

CREATE TEMP TABLE _purge_proposals ON COMMIT DROP AS
SELECT proposal_id FROM proposals;

CREATE TEMP TABLE _purge_consultations ON COMMIT DROP AS
SELECT consultation_id FROM consultations;

CREATE TEMP TABLE _purge_surveys ON COMMIT DROP AS
SELECT survey_id FROM surveys;

CREATE TEMP TABLE _purge_measurements ON COMMIT DROP AS
SELECT measurement_id FROM measurements;

CREATE TEMP TABLE _purge_positions ON COMMIT DROP AS
SELECT position_id FROM project_positions;

CREATE TEMP TABLE _purge_calendar_events ON COMMIT DROP AS
SELECT calendar_event_id
FROM calendar_events
WHERE lead_id IN (SELECT lead_id FROM _purge_leads)
   OR deal_id IN (SELECT deal_id FROM _purge_deals)
   OR project_id IN (SELECT project_id FROM _purge_projects)
   OR calendar_event_id IN (
     SELECT calendar_event_id
     FROM consultations
     WHERE calendar_event_id IS NOT NULL
   );

CREATE TEMP TABLE _purge_installer_jobs ON COMMIT DROP AS
SELECT installer_job_id FROM installer_jobs
WHERE project_id IN (SELECT project_id FROM _purge_projects);

CREATE TEMP TABLE _purge_job_sessions ON COMMIT DROP AS
SELECT work_session_id
FROM installer_work_sessions
WHERE installer_job_id IN (SELECT installer_job_id FROM _purge_installer_jobs);

CREATE TEMP TABLE _purge_files ON COMMIT DROP AS
SELECT file_id
FROM attachments_files
WHERE lead_id IN (SELECT lead_id FROM _purge_leads)
   OR deal_id IN (SELECT deal_id FROM _purge_deals)
   OR project_id IN (SELECT project_id FROM _purge_projects)
   OR position_id IN (SELECT position_id FROM _purge_positions)
   OR calendar_event_id IN (SELECT calendar_event_id FROM _purge_calendar_events)
   OR consultation_id IN (SELECT consultation_id FROM _purge_consultations)
   OR survey_id IN (SELECT survey_id FROM _purge_surveys)
   OR measurement_id IN (SELECT measurement_id FROM _purge_measurements)
   OR installer_job_id IN (SELECT installer_job_id FROM _purge_installer_jobs);

-- Keep a structural snapshot of every legacy workspace except the four
-- authorized customer/project arrays. The postcondition below proves that the
-- cleanup did not mutate users/settings/catalog/warehouse/payroll or any other
-- top-level compatibility state.
CREATE TEMP TABLE _legacy_preserved ON COMMIT DROP AS
SELECT
  workspace_id,
  payload - 'clients' - 'orders' - 'notifications' - 'reviews' AS preserved_payload
FROM legacy_workspaces;

CREATE TEMP TABLE _preserved_counts ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM user_access) AS user_access_count,
  (SELECT COUNT(*) FROM service_types) AS service_types_count,
  (SELECT COUNT(*) FROM service_addons) AS service_addons_count,
  (SELECT COUNT(*) FROM film_catalog) AS film_catalog_count,
  (SELECT COUNT(*) FROM crews) AS crews_count;

DO $$
DECLARE
  lead_count bigint;
  client_count bigint;
  deal_count bigint;
  project_count bigint;
  proposal_count bigint;
  consultation_count bigint;
  session_count bigint;
BEGIN
  SELECT COUNT(*) INTO lead_count FROM _purge_leads;
  SELECT COUNT(*) INTO client_count FROM _purge_clients;
  SELECT COUNT(*) INTO deal_count FROM _purge_deals;
  SELECT COUNT(*) INTO project_count FROM _purge_projects;
  SELECT COUNT(*) INTO proposal_count FROM _purge_proposals;
  SELECT COUNT(*) INTO consultation_count FROM _purge_consultations;
  SELECT COUNT(*) INTO session_count FROM _purge_job_sessions;

  RAISE NOTICE 'ROLANPRO authorized test-data cleanup: leads=%, clients=%, deals=%, projects=%, proposals=%, consultations=%, job-linked work sessions=%',
    lead_count, client_count, deal_count, project_count, proposal_count, consultation_count, session_count;
END
$$;

-- Work sessions linked to test installer jobs must be removed before jobs are
-- deleted because InstallerWorkSession.installer_job uses ON DELETE SET NULL.
DELETE FROM installer_location_points
WHERE work_session_id IN (SELECT work_session_id FROM _purge_job_sessions);

DELETE FROM installer_work_sessions
WHERE work_session_id IN (SELECT work_session_id FROM _purge_job_sessions);

DELETE FROM installer_payroll_accruals
WHERE installer_job_id IN (SELECT installer_job_id FROM _purge_installer_jobs)
   OR project_id IN (SELECT project_id FROM _purge_projects);

-- Documents must go before their business attachment files. Independent files
-- and documents are preserved.
DELETE FROM documents
WHERE client_id IN (SELECT client_id FROM _purge_clients)
   OR deal_id IN (SELECT deal_id FROM _purge_deals)
   OR project_id IN (SELECT project_id FROM _purge_projects)
   OR file_id IN (SELECT file_id FROM _purge_files);

DELETE FROM attachments_files
WHERE file_id IN (SELECT file_id FROM _purge_files);

-- Proposal children.
DELETE FROM proposal_events
WHERE proposal_id IN (SELECT proposal_id FROM _purge_proposals);

DELETE FROM agreements
WHERE proposal_id IN (SELECT proposal_id FROM _purge_proposals);

DELETE FROM deposits
WHERE proposal_id IN (SELECT proposal_id FROM _purge_proposals);

DELETE FROM proposal_items
WHERE proposal_id IN (SELECT proposal_id FROM _purge_proposals);

-- Survey / measurement children.
DELETE FROM survey_recommendations
WHERE survey_id IN (SELECT survey_id FROM _purge_surveys)
   OR measurement_id IN (SELECT measurement_id FROM _purge_measurements);

DELETE FROM measurements
WHERE measurement_id IN (SELECT measurement_id FROM _purge_measurements);

DELETE FROM surveys
WHERE survey_id IN (SELECT survey_id FROM _purge_surveys);

-- Project execution children.
DELETE FROM installer_jobs
WHERE installer_job_id IN (SELECT installer_job_id FROM _purge_installer_jobs);

DELETE FROM schedule_assignments
WHERE project_id IN (SELECT project_id FROM _purge_projects);

DELETE FROM project_position_addons
WHERE position_id IN (SELECT position_id FROM _purge_positions);

DELETE FROM project_positions
WHERE position_id IN (SELECT position_id FROM _purge_positions);

-- Consultation rows are deleted after surveys and before their calendar events.
DELETE FROM consultations
WHERE consultation_id IN (SELECT consultation_id FROM _purge_consultations);

DELETE FROM calendar_events
WHERE calendar_event_id IN (SELECT calendar_event_id FROM _purge_calendar_events);

-- Generic operational records: remove only rows belonging to the authorized
-- customer/project entities. Employee-only/system records remain.
DELETE FROM follow_ups
WHERE lead_id IN (SELECT lead_id FROM _purge_leads)
   OR deal_id IN (SELECT deal_id FROM _purge_deals);

DELETE FROM tasks
WHERE lead_id IN (SELECT lead_id FROM _purge_leads)
   OR deal_id IN (SELECT deal_id FROM _purge_deals)
   OR LOWER(COALESCE(entity_type, '')) IN (
     'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
     'measurement', 'project_position', 'installer_job'
   );

DELETE FROM activity_log
WHERE project_id IN (SELECT project_id FROM _purge_projects)
   OR LOWER(entity_type) IN (
     'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
     'measurement', 'project_position', 'installer_job'
   );

DELETE FROM notifications
WHERE LOWER(COALESCE(entity_type, '')) IN (
  'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
  'measurement', 'project_position', 'installer_job'
);

DELETE FROM email_actions
WHERE LOWER(entity_type) IN (
  'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
  'measurement', 'project_position', 'installer_job'
);

-- Parent business records. Proposal must be removed before Deal/Client because
-- it has required Deal and Client relations; Project before Client because the
-- Project -> Client relation is RESTRICT.
DELETE FROM proposals
WHERE proposal_id IN (SELECT proposal_id FROM _purge_proposals);

DELETE FROM projects
WHERE project_id IN (SELECT project_id FROM _purge_projects);

DELETE FROM deals
WHERE deal_id IN (SELECT deal_id FROM _purge_deals);

DELETE FROM leads
WHERE lead_id IN (SELECT lead_id FROM _purge_leads);

DELETE FROM clients
WHERE client_id IN (SELECT client_id FROM _purge_clients);

-- Preserve message history but detach compatibility identifiers that point to
-- the now-removed test customer/order records.
UPDATE gmail_messages
SET legacy_client_id = NULL,
    legacy_order_id = NULL
WHERE legacy_client_id IS NOT NULL
   OR legacy_order_id IS NOT NULL;

UPDATE twilio_messages
SET legacy_client_id = NULL,
    legacy_order_id = NULL
WHERE legacy_client_id IS NOT NULL
   OR legacy_order_id IS NOT NULL;

-- Clear only the authorized legacy customer/project arrays. jsonb_set with
-- create_missing=true also normalizes old workspaces where one array was absent.
UPDATE legacy_workspaces
SET payload = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(payload, '{clients}', '[]'::jsonb, true),
      '{orders}', '[]'::jsonb, true
    ),
    '{notifications}', '[]'::jsonb, true
  ),
  '{reviews}', '[]'::jsonb, true
),
revision = revision + 1,
updated_at = CURRENT_TIMESTAMP;

-- Hard postconditions. Any failure raises an exception and the entire cleanup
-- transaction rolls back, leaving production data unchanged.
DO $$
DECLARE
  remaining bigint;
  preserved record;
BEGIN
  SELECT
      (SELECT COUNT(*) FROM leads)
    + (SELECT COUNT(*) FROM clients)
    + (SELECT COUNT(*) FROM deals)
    + (SELECT COUNT(*) FROM projects)
    + (SELECT COUNT(*) FROM proposals)
    + (SELECT COUNT(*) FROM proposal_items)
    + (SELECT COUNT(*) FROM proposal_events)
    + (SELECT COUNT(*) FROM agreements)
    + (SELECT COUNT(*) FROM deposits)
    + (SELECT COUNT(*) FROM consultations)
    + (SELECT COUNT(*) FROM surveys)
    + (SELECT COUNT(*) FROM measurements)
    + (SELECT COUNT(*) FROM survey_recommendations)
    + (SELECT COUNT(*) FROM project_positions)
    + (SELECT COUNT(*) FROM project_position_addons)
    + (SELECT COUNT(*) FROM schedule_assignments)
    + (SELECT COUNT(*) FROM installer_jobs)
    + (SELECT COUNT(*) FROM installer_payroll_accruals)
  INTO remaining;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: % core customer/project rows remain', remaining;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM installer_work_sessions
    WHERE work_session_id IN (SELECT work_session_id FROM _purge_job_sessions)
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: test job-linked work sessions remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tasks
    WHERE lead_id IS NOT NULL
       OR deal_id IS NOT NULL
       OR LOWER(COALESCE(entity_type, '')) IN (
         'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
         'measurement', 'project_position', 'installer_job'
       )
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: business tasks remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM follow_ups WHERE lead_id IS NOT NULL OR deal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: business follow-ups remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM activity_log
    WHERE project_id IS NOT NULL
       OR LOWER(entity_type) IN (
         'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
         'measurement', 'project_position', 'installer_job'
       )
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: business activity log rows remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE LOWER(COALESCE(entity_type, '')) IN (
      'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
      'measurement', 'project_position', 'installer_job'
    )
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: business notifications remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM email_actions
    WHERE LOWER(entity_type) IN (
      'lead', 'client', 'deal', 'project', 'proposal', 'consultation', 'survey',
      'measurement', 'project_position', 'installer_job'
    )
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: business email actions remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM gmail_messages
    WHERE legacy_client_id IS NOT NULL OR legacy_order_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM twilio_messages
    WHERE legacy_client_id IS NOT NULL OR legacy_order_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: legacy message links remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legacy_workspaces
    WHERE jsonb_array_length(COALESCE(payload->'clients', '[]'::jsonb)) <> 0
       OR jsonb_array_length(COALESCE(payload->'orders', '[]'::jsonb)) <> 0
       OR jsonb_array_length(COALESCE(payload->'notifications', '[]'::jsonb)) <> 0
       OR jsonb_array_length(COALESCE(payload->'reviews', '[]'::jsonb)) <> 0
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: legacy customer/project arrays are not empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legacy_workspaces lw
    JOIN _legacy_preserved p USING (workspace_id)
    WHERE (lw.payload - 'clients' - 'orders' - 'notifications' - 'reviews') IS DISTINCT FROM p.preserved_payload
  ) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: non-customer legacy workspace data changed';
  END IF;

  SELECT * INTO preserved FROM _preserved_counts;
  IF preserved.users_count <> (SELECT COUNT(*) FROM users)
     OR preserved.user_access_count <> (SELECT COUNT(*) FROM user_access)
     OR preserved.service_types_count <> (SELECT COUNT(*) FROM service_types)
     OR preserved.service_addons_count <> (SELECT COUNT(*) FROM service_addons)
     OR preserved.film_catalog_count <> (SELECT COUNT(*) FROM film_catalog)
     OR preserved.crews_count <> (SELECT COUNT(*) FROM crews) THEN
    RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed: protected reference/team row counts changed';
  END IF;

  RAISE NOTICE 'ROLANPRO authorized test-data cleanup completed; all customer/project postconditions passed';
END
$$;

COMMIT;
