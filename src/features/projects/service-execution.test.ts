import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectPhaseInput } from "./phases-request";
import { serviceEventScope } from "./service-execution";

const id = "00000000-0000-4000-8000-000000000001";
const body = { title: "Solar", starts_at: "2026-10-05T16:00:00Z", ends_at: "2026-10-05T20:00:00Z", position_ids: [id], assignments: [{ project_position_id: id, installer_id: id }] };
test("service work orders reject malformed dates, identities and confirmation flags", () => {
  assert.ok(parseProjectPhaseInput(body));
  for (const patch of [{ title: 5 }, { title: " " }, { starts_at: "tomorrow" }, { ends_at: body.starts_at }, { position_ids: ["bad"] }, { assignments: [null] }, { client_confirmed: "false" }, { crew_id: "bad" }, { notes: {} }]) {
    assert.equal(parseProjectPhaseInput({ ...body, ...patch }), null);
  }
});
test("service schedule scope restricts managers to their projects and workers to assigned jobs", () => {
  assert.deepEqual(serviceEventScope({ user: { user_id: id }, roles: ["OWNER"] }), {});
  assert.deepEqual(serviceEventScope({ user: { user_id: id }, roles: ["MANAGER"] }), { project: { manager_id: id } });
  assert.deepEqual(serviceEventScope({ user: { user_id: id }, roles: ["INSTALLER"] }), { installer_jobs: { some: { installer_id: id } } });
});
