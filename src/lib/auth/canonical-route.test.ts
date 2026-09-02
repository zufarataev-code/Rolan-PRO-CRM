import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRolePath } from "./canonical-route";

test("old survey routes lead into the single CRM namespace", () => {
  assert.equal(canonicalRolePath("/survey"), "/legacy-crm/survey");
  assert.equal(
    canonicalRolePath("/survey/consultations/c_123"),
    "/legacy-crm/survey/consultations/c_123",
  );
});

test("old installer routes lead into the single CRM namespace", () => {
  assert.equal(canonicalRolePath("/installer"), "/legacy-crm/installer");
  assert.equal(canonicalRolePath("/installer/today"), "/legacy-crm/installer");
  assert.equal(canonicalRolePath("/installer/jobs"), "/legacy-crm/installer/jobs");
  assert.equal(
    canonicalRolePath("/installer/jobs/job_123"),
    "/legacy-crm/installer/jobs/job_123",
  );
});

test("canonical and unrelated routes are left unchanged", () => {
  assert.equal(canonicalRolePath("/legacy-crm/survey"), "/legacy-crm/survey");
  assert.equal(canonicalRolePath("/legacy-crm"), "/legacy-crm");
  assert.equal(canonicalRolePath("/login"), "/login");
});
