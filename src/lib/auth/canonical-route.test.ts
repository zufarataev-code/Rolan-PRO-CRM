import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRolePath } from "./canonical-route";

test("owner and manager routes lead into the single CRM namespace", () => {
  assert.equal(canonicalRolePath("/owner"), "/legacy-crm");
  assert.equal(canonicalRolePath("/owner/settings/pricing"), "/legacy-crm");
  assert.equal(canonicalRolePath("/manager"), "/legacy-crm");
  assert.equal(canonicalRolePath("/manager/crm/pipeline"), "/legacy-crm");
  assert.equal(canonicalRolePath("/manager/crm/calculator"), "/legacy-crm");
  assert.equal(canonicalRolePath("/manager/projects/project_123"), "/legacy-crm");
});

test("old survey routes lead into the single CRM namespace", () => {
  assert.equal(canonicalRolePath("/survey"), "/legacy-crm");
  assert.equal(canonicalRolePath("/survey/consultations/c_123"), "/legacy-crm");
});

test("old installer routes lead into the single CRM namespace", () => {
  assert.equal(canonicalRolePath("/installer"), "/legacy-crm");
  assert.equal(canonicalRolePath("/installer/today"), "/legacy-crm");
  assert.equal(canonicalRolePath("/installer/jobs"), "/legacy-crm");
  assert.equal(canonicalRolePath("/installer/jobs/job_123"), "/legacy-crm");
});

test("canonical workspace stays canonical and unrelated routes are untouched", () => {
  assert.equal(canonicalRolePath("/legacy-crm/survey"), "/legacy-crm");
  assert.equal(canonicalRolePath("/legacy-crm/installer/notifications"), "/legacy-crm");
  assert.equal(canonicalRolePath("/legacy-crm"), "/legacy-crm");
  assert.equal(canonicalRolePath("/login"), "/login");
  assert.equal(canonicalRolePath("/api/v1/projects"), "/api/v1/projects");
  assert.equal(canonicalRolePath("/proposal/public-token"), "/proposal/public-token");
});
