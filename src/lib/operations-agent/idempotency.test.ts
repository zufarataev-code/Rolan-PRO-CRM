import assert from "node:assert/strict";
import test from "node:test";

import { buildOperationsRequestFingerprint } from "@/lib/operations-agent/idempotency";

test("operations request fingerprint is stable across object key order", () => {
  const first = buildOperationsRequestFingerprint("record_project_expense", {
    project_id: "p1",
    amount: 240,
    nested: { b: 2, a: 1 },
  });
  const second = buildOperationsRequestFingerprint("record_project_expense", {
    nested: { a: 1, b: 2 },
    amount: 240,
    project_id: "p1",
  });
  assert.equal(first, second);
});

test("operations request fingerprint changes with action or payload", () => {
  const base = buildOperationsRequestFingerprint("record_project_expense", {
    project_id: "p1",
    amount: 240,
  });
  assert.notEqual(
    base,
    buildOperationsRequestFingerprint("record_project_expense", {
      project_id: "p1",
      amount: 241,
    }),
  );
  assert.notEqual(
    base,
    buildOperationsRequestFingerprint("add_project_note", {
      project_id: "p1",
      amount: 240,
    }),
  );
});
