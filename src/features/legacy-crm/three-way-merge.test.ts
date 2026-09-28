import assert from "node:assert/strict";
import test from "node:test";

import { mergeLegacyWorkspacePayload } from "./three-way-merge";

test("merges edits made in different CRM tabs without losing either project", () => {
  const base = {
    orders: [
      { id: "order-a", price: 100, note: "" },
      { id: "order-b", price: 200, note: "" },
    ],
    users: [{ id: "owner", name: "Зуфар" }],
  };
  const local = structuredClone(base);
  local.orders[0].price = 125;
  const remote = structuredClone(base);
  remote.orders[1].note = "Замер назначен";

  const result = mergeLegacyWorkspacePayload(base, local, remote);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    orders: [
      { id: "order-a", price: 125, note: "" },
      { id: "order-b", price: 200, note: "Замер назначен" },
    ],
    users: [{ id: "owner", name: "Зуфар" }],
  });
});

test("keeps additions from both CRM tabs in stable entity arrays", () => {
  const base = { tasks: [{ id: "existing", title: "Позвонить" }] };
  const local = { tasks: [...base.tasks, { id: "local", title: "Сделать КП" }] };
  const remote = { tasks: [...base.tasks, { id: "remote", title: "Назначить замер" }] };

  const result = mergeLegacyWorkspacePayload(base, local, remote);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    (result.value as typeof base).tasks.map((task) => task.id),
    ["existing", "remote", "local"],
  );
});

test("reports a same-field conflict instead of silently overwriting a coworker", () => {
  const base = { orders: [{ id: "order-a", price: 100 }] };
  const local = { orders: [{ id: "order-a", price: 125 }] };
  const remote = { orders: [{ id: "order-a", price: 150 }] };

  const result = mergeLegacyWorkspacePayload(base, local, remote);

  assert.deepEqual(result, {
    ok: false,
    conflictPaths: ["orders[id=order-a].price"],
  });
});

test("merges a deletion when the other tab left the entity unchanged", () => {
  const base = { tasks: [{ id: "done", title: "Готово" }, { id: "open", title: "В работе" }] };
  const local = { tasks: [{ id: "open", title: "В работе" }] };
  const remote = structuredClone(base);

  const result = mergeLegacyWorkspacePayload(base, local, remote);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, local);
});
