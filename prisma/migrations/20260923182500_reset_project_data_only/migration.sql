-- Owner-authorized one-time reset of PROJECT data only.
-- Preserve leads, clients, deals, proposals, consultations, catalog, warehouse,
-- users, services/pricing, integrations, and independent employee work sessions.

BEGIN;

LOCK TABLE
  projects,
  project_positions,
  project_position_addons,
  schedule_assignments,
  installer_jobs,
  installer_payroll_accruals,
  installer_work_sessions,
  installer_location_points,
  calendar_events,
  consultations,
  tasks,
  activity_log,
  notifications,
  email_actions,
  legacy_workspaces
IN ACCESS EXCLUSIVE MODE;

LOCK TABLE
  leads,
  clients,
  deals,
  proposals,
  users,
  film_catalog,
  service_types,
  service_addons
IN SHARE MODE;

CREATE TEMP TABLE _reset_projects ON COMMIT DROP AS
SELECT project_id FROM projects;

CREATE TEMP TABLE _reset_positions ON COMMIT DROP AS
SELECT position_id
FROM project_positions
WHERE project_id IN (SELECT project_id FROM _reset_projects);

CREATE TEMP TABLE _reset_installer_jobs ON COMMIT DROP AS
SELECT installer_job_id
FROM installer_jobs
WHERE project_id IN (SELECT project_id FROM _reset_projects);

CREATE TEMP TABLE _reset_job_sessions ON COMMIT DROP AS
SELECT work_session_id
FROM installer_work_sessions
WHERE installer_job_id IN (SELECT installer_job_id FROM _reset_installer_jobs);

CREATE TEMP TABLE _preserved_business_counts ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM leads) AS leads_count,
  (SELECT COUNT(*) FROM clients) AS clients_count,
  (SELECT COUNT(*) FROM deals) AS deals_count,
  (SELECT COUNT(*) FROM proposals) AS proposals_count,
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM film_catalog) AS film_catalog_count,
  (SELECT COUNT(*) FROM service_types) AS service_types_count,
  (SELECT COUNT(*) FROM service_addons) AS service_addons_count;

DO $$
DECLARE
  project_count bigint;
  job_count bigint;
  session_count bigint;
BEGIN
  SELECT COUNT(*) INTO project_count FROM _reset_projects;
  SELECT COUNT(*) INTO job_count FROM _reset_installer_jobs;
  SELECT COUNT(*) INTO session_count FROM _reset_job_sessions;

  RAISE NOTICE 'ROLANPRO project reset: projects=%, installer_jobs=%, job_sessions=%',
    project_count, job_count, session_count;
END
$$;

-- Remove work sessions that exist only because of project installer jobs.
-- Independent employee shifts are intentionally preserved.
DELETE FROM installer_location_points
WHERE work_session_id IN (SELECT work_session_id FROM _reset_job_sessions);

DELETE FROM installer_work_sessions
WHERE work_session_id IN (SELECT work_session_id FROM _reset_job_sessions);

-- Remove generic project-only operational rows that do not have FK cascades.
DELETE FROM tasks
WHERE LOWER(COALESCE(entity_type, '')) = 'project'
  AND entity_id IN (SELECT project_id FROM _reset_projects);

DELETE FROM activity_log
WHERE project_id IN (SELECT project_id FROM _reset_projects)
   OR (
     LOWER(entity_type) = 'project'
     AND entity_id IN (SELECT project_id FROM _reset_projects)
   );

DELETE FROM notifications
WHERE LOWER(COALESCE(entity_type, '')) = 'project'
  AND entity_id IN (SELECT project_id FROM _reset_projects);

DELETE FROM email_actions
WHERE LOWER(entity_type) = 'project'
  AND entity_id IN (SELECT project_id FROM _reset_projects);

-- Keep lead/deal calendar history if an event is shared with sales records.
-- Pure project events are deleted so the dispatch calendar is also reset.
DELETE FROM calendar_events
WHERE project_id IN (SELECT project_id FROM _reset_projects)
  AND lead_id IS NULL
  AND deal_id IS NULL;

UPDATE calendar_events
SET project_id = NULL
WHERE project_id IN (SELECT project_id FROM _reset_projects);

-- A consultation may predate the Project and therefore remains sales history.
UPDATE consultations
SET project_id = NULL
WHERE project_id IN (SELECT project_id FROM _reset_projects);

-- ProjectPosition, ScheduleAssignment, InstallerJob and payroll accrual rows
-- are removed by their FK cascades from Project.
DELETE FROM projects
WHERE project_id IN (SELECT project_id FROM _reset_projects);

-- /legacy-crm still projects customer jobs from payload.orders. Clear only
-- that project array; clients, settings, catalog, warehouse, team, etc. stay intact.
UPDATE legacy_workspaces
SET payload = jsonb_set(payload, '{orders}', '[]'::jsonb, true),
    revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
  preserved record;
  remaining bigint;
BEGIN
  SELECT
      (SELECT COUNT(*) FROM projects)
    + (SELECT COUNT(*) FROM project_positions)
    + (SELECT COUNT(*) FROM schedule_assignments)
    + (SELECT COUNT(*) FROM installer_jobs)
    + (SELECT COUNT(*) FROM installer_payroll_accruals)
  INTO remaining;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'ROLANPRO project reset failed: % project rows remain', remaining;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM installer_work_sessions
    WHERE work_session_id IN (SELECT work_session_id FROM _reset_job_sessions)
  ) THEN
    RAISE EXCEPTION 'ROLANPRO project reset failed: project job work sessions remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legacy_workspaces
    WHERE jsonb_array_length(COALESCE(payload->'orders', '[]'::jsonb)) <> 0
  ) THEN
    RAISE EXCEPTION 'ROLANPRO project reset failed: legacy orders remain';
  END IF;

  SELECT * INTO preserved FROM _preserved_business_counts;

  IF preserved.leads_count <> (SELECT COUNT(*) FROM leads)
     OR preserved.clients_count <> (SELECT COUNT(*) FROM clients)
     OR preserved.deals_count <> (SELECT COUNT(*) FROM deals)
     OR preserved.proposals_count <> (SELECT COUNT(*) FROM proposals)
     OR preserved.users_count <> (SELECT COUNT(*) FROM users)
     OR preserved.film_catalog_count <> (SELECT COUNT(*) FROM film_catalog)
     OR preserved.service_types_count <> (SELECT COUNT(*) FROM service_types)
     OR preserved.service_addons_count <> (SELECT COUNT(*) FROM service_addons) THEN
    RAISE EXCEPTION 'ROLANPRO project reset failed: protected business/reference counts changed';
  END IF;

  RAISE NOTICE 'ROLANPRO project reset completed; leads/clients/deals/proposals/catalog/users preserved';
END
$$;

COMMIT;
