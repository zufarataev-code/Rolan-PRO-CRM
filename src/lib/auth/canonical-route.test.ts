import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRolePath } from "./canonical-route";

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

test("duplicate CRM shells collapse into the actual workspace", () => {
  assert.equal(canonicalRolePath("/legacy-crm/survey"), "/legacy-crm");
  assert.equal(canonicalRolePath("/legacy-crm/installer/notifications"), "/legacy-crm");
  assert.equal(canonicalRolePath("/legacy-crm"), "/legacy-crm");
  assert.equal(canonicalRolePath("/login"), "/login");
});
