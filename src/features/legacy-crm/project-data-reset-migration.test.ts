import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260923182500_reset_project_data_only/migration.sql";
const sql = () => readFileSync(migrationPath, "utf8");

test("project reset is transactional and empties both project stores", () => {
  const migration = sql();
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.match(migration, /DELETE FROM projects/);
  assert.match(migration, /jsonb_set\(payload, '\{orders\}', '\[\]'::jsonb, true\)/);
  assert.match(migration, /SELECT COUNT\(\*\) FROM projects/);
  assert.match(migration, /SELECT COUNT\(\*\) FROM project_positions/);
  assert.match(migration, /SELECT COUNT\(\*\) FROM installer_jobs/);
});

test("project reset preserves sales contacts and reference data", () => {
  const migration = sql();
  for (const table of [
    "leads",
    "clients",
    "deals",
    "proposals",
    "users",
    "film_catalog",
    "service_types",
    "service_addons",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`(?:DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+${table}\\b`, "i"),
    );
    assert.match(migration, new RegExp(`SELECT COUNT\\(\\*\\) FROM ${table}`));
  }
});

test("project-linked installer work sessions are removed but independent shifts are preserved", () => {
  const migration = sql();
  assert.match(
    migration,
    /CREATE TEMP TABLE _reset_job_sessions[\s\S]*WHERE installer_job_id IN/,
  );
  assert.match(
    migration,
    /DELETE FROM installer_work_sessions[\s\S]*WHERE work_session_id IN \(SELECT work_session_id FROM _reset_job_sessions\)/,
  );
  assert.doesNotMatch(migration, /DELETE FROM installer_work_sessions\s*;/);
});

test("shared sales calendar and consultations survive project reset", () => {
  const migration = sql();
  assert.match(
    migration,
    /DELETE FROM calendar_events[\s\S]*lead_id IS NULL[\s\S]*deal_id IS NULL/,
  );
  assert.match(migration, /UPDATE calendar_events[\s\S]*SET project_id = NULL/);
  assert.match(migration, /UPDATE consultations[\s\S]*SET project_id = NULL/);
  assert.doesNotMatch(migration, /DELETE FROM consultations/);
});
