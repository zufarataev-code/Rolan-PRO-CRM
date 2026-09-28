import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isHighRiskOperationsAction,
  isOperationsAgentAction,
  isOperationsAgentWriteAction,
} from "@/lib/operations-agent/policy";

test("operations agent allowlist separates safe reads and writes", () => {
  assert.equal(isOperationsAgentAction("find_project"), true);
  assert.equal(isOperationsAgentWriteAction("find_project"), false);
  assert.equal(isOperationsAgentAction("record_project_expense"), true);
  assert.equal(isOperationsAgentWriteAction("record_project_expense"), true);
});

test("high-risk operations are not silently allowlisted", () => {
  for (const action of ["delete_project", "refund_payment", "bulk_update", "change_price", "send_message"]) {
    assert.equal(isOperationsAgentAction(action), false);
    assert.equal(isHighRiskOperationsAction(action), true);
  }
});

test("implementation persists real business writes and durable receipts", () => {
  const source = readFileSync("src/lib/operations-agent/index.ts", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260926_operations_agent_idempotency/migration.sql",
    "utf8",
  );

  assert.match(source, /createManualProject/);
  assert.match(source, /createConsultation/);
  assert.match(source, /addMeasurementsBatch/);
  assert.match(source, /finance\.expense\.recorded/);
  assert.match(source, /prisma\.task\.create/);
  assert.match(source, /operations_agent\.request/);
  assert.match(source, /duplicate: true/);
  assert.match(source, /idempotency_conflict/);
  assert.match(source, /client_id: clientId \|\| null/);
  assert.doesNotMatch(source, /Placeholder for action handling logic/);
  assert.match(migration, /UNIQUE INDEX/);
  assert.match(migration, /idempotency_key/);
});
