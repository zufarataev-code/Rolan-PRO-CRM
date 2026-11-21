import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRolePath } from "./canonical-route";

test("owner and manager routes lead into the new /crm interface", () => {
  assert.equal(canonicalRolePath("/owner"), "/crm");
  assert.equal(canonicalRolePath("/owner/settings/pricing"), "/crm");
  assert.equal(canonicalRolePath("/manager"), "/crm");
  assert.equal(canonicalRolePath("/manager/crm/pipeline"), "/crm");
  assert.equal(canonicalRolePath("/manager/crm/calculator"), "/crm");
  assert.equal(canonicalRolePath("/manager/projects/project_123"), "/crm");
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
  assert.equal(canonicalRolePath("/crm"), "/crm");
  assert.equal(canonicalRolePath("/crm/projects/p_1"), "/crm/projects/p_1");
  assert.equal(canonicalRolePath("/login"), "/login");
  assert.equal(canonicalRolePath("/api/v1/projects"), "/api/v1/projects");
  assert.equal(canonicalRolePath("/proposal/public-token"), "/proposal/public-token");
});
