import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientAccessWhere,
  buildDealAccessWhere,
  buildFollowUpAccessWhere,
  buildLeadAccessWhere,
  buildTaskAccessWhere,
  getRecordManagerScope,
  isCrossManagerAssignment,
} from "@/features/sales/access";

const managerA = "00000000-0000-4000-8000-00000000000a";
const managerB = "00000000-0000-4000-8000-00000000000b";

test("record filters bind each manager to their own assigned records", () => {
  assert.deepEqual(buildDealAccessWhere("deal-1", managerA), {
    deal_id: "deal-1",
    assigned_manager_id: managerA,
  });
  assert.deepEqual(buildLeadAccessWhere("lead-1", managerB), {
    lead_id: "lead-1",
    assigned_manager_id: managerB,
  });
  assert.deepEqual(buildTaskAccessWhere("task-1", managerA), {
    task_id: "task-1",
    assigned_to: managerA,
  });
  assert.deepEqual(buildFollowUpAccessWhere("follow-up-1", managerB), {
    follow_up_id: "follow-up-1",
    assigned_to: managerB,
  });
});

test("client filters include only clients connected to the active manager", () => {
  assert.deepEqual(buildClientAccessWhere("client-1", managerA), {
    client_id: "client-1",
    OR: [
      { deals: { some: { assigned_manager_id: managerA } } },
      { projects: { some: { manager_id: managerA } } },
    ],
  });
});

test("owner filters remain unrestricted when no manager scope is supplied", () => {
  assert.deepEqual(buildDealAccessWhere("deal-1"), { deal_id: "deal-1" });
  assert.deepEqual(buildClientAccessWhere(undefined), {});
});

test("manager sessions are scoped while owner sessions remain unrestricted", () => {
  assert.equal(getRecordManagerScope({ user: { user_id: managerA }, roles: ["MANAGER"] }), managerA);
  assert.equal(getRecordManagerScope({ user: { user_id: managerB }, roles: ["MANAGER"] }), managerB);
  assert.equal(getRecordManagerScope({ user: { user_id: managerA }, roles: ["OWNER", "MANAGER"] }), undefined);
});

test("a manager cannot assign a record to another manager", () => {
  assert.equal(isCrossManagerAssignment(managerA, managerB), true);
  assert.equal(isCrossManagerAssignment(managerA, managerA), false);
  assert.equal(isCrossManagerAssignment(managerA, undefined), false);
  assert.equal(isCrossManagerAssignment(undefined, managerB), false);
});
