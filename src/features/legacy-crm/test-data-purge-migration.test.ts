import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260917182500_purge_test_customer_project_data/migration.sql";
const migration = () => readFileSync(migrationPath, "utf8");

test("test-data purge is transactional and rolls back on failed postconditions", () => {
  const sql = migration();
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /RAISE EXCEPTION 'ROLANPRO cleanup postcondition failed:/);
  assert.match(sql, /ROLANPRO authorized test-data cleanup completed/);
});

test("employee work sessions linked to test jobs are removed before installer jobs", () => {
  const sql = migration();
  const sessionDelete = sql.indexOf("DELETE FROM installer_work_sessions");
  const jobDelete = sql.indexOf("DELETE FROM installer_jobs");

  assert.ok(sessionDelete >= 0, "job-linked work-session cleanup must exist");
  assert.ok(jobDelete > sessionDelete, "work sessions must be deleted before installer jobs");
  assert.match(sql, /WHERE installer_job_id IN \(SELECT installer_job_id FROM _purge_installer_jobs\)/);
});

test("message history is preserved while legacy customer links are detached", () => {
  const sql = migration();
  assert.match(sql, /UPDATE gmail_messages[\s\S]*legacy_client_id = NULL/);
  assert.match(sql, /UPDATE twilio_messages[\s\S]*legacy_client_id = NULL/);
  assert.doesNotMatch(sql, /DELETE FROM gmail_messages/);
  assert.doesNotMatch(sql, /DELETE FROM twilio_messages/);
});

test("protected team and reference tables are never deleted or truncated", () => {
  const sql = migration();
  for (const table of [
    "users",
    "user_access",
    "roles",
    "service_types",
    "service_addons",
    "film_catalog",
    "crews",
    "pipeline_statuses",
    "project_statuses",
    "payment_statuses",
    "position_statuses",
    "cities",
  ]) {
    assert.doesNotMatch(sql, new RegExp(`(?:DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+${table}\\b`, "i"));
  }
});

test("legacy cleanup clears only authorized customer/project arrays", () => {
  const sql = migration();
  assert.match(sql, /jsonb_set\([\s\S]*'\{clients\}'[\s\S]*'\{orders\}'[\s\S]*'\{notifications\}'[\s\S]*'\{reviews\}'/);
  assert.match(sql, /payload - 'clients' - 'orders' - 'notifications' - 'reviews'/);
  assert.match(sql, /non-customer legacy workspace data changed/);
  assert.doesNotMatch(sql, /'\{users\}'/);
  assert.doesNotMatch(sql, /'\{settings\}'/);
  assert.doesNotMatch(sql, /'\{catalog\}'/);
  assert.doesNotMatch(sql, /'\{warehouse\}'/);
  assert.doesNotMatch(sql, /'\{payroll\}'/);
});

test("core customer and project tables must be empty after the purge", () => {
  const sql = migration();
  for (const table of [
    "leads",
    "clients",
    "deals",
    "projects",
    "proposals",
    "consultations",
    "surveys",
    "measurements",
    "project_positions",
    "installer_jobs",
  ]) {
    assert.match(sql, new RegExp(`SELECT COUNT\\(\\*\\) FROM ${table}`));
  }
});
