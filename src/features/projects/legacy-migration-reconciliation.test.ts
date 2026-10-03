import assert from "node:assert/strict";
import test from "node:test";
import { reconcileLegacyProjectReferences, type ReconciliationReferences } from "./legacy-migration-reconciliation";
import { auditLegacyProjectMigration } from "./legacy-migration-audit";
const refs: ReconciliationReferences = {
  clients: [{ client_id: "email-client", email: "private@example.com", phone: null }, { client_id: "phone-client", email: null, phone: "+12125551234" }],
  projects: [{ project_id: "unlinked-project", client_id: "phone-client" }], films: [{ film_id: "film" }],
};
const payload = {
  clients: [{ id: "client", name: "PRIVATE NAME", email: "PRIVATE@example.com", phone: "2125551234" }],
  orders: [{ id: "order", clientId: "client", paid: 120, payments: [{ amount: 100 }], measurements: { rooms: [{ windows: [{ id: "opening", catalogId: "old-film", width: 254, height: 508, qty: 1, filmType: "PRIVATE LABEL" }] }] } }],
  settings: { catalog: [{ id: "old-film", retailPerSqft: 12 }] },
};
test("reconciliation reports conflicting contacts and unlinked projects without exposing contacts or guessing linkage", () => {
  const before = JSON.stringify(payload);
  const report = reconcileLegacyProjectReferences(payload, refs);
  assert.equal(report[0].client_mapping, "ambiguous");
  assert.deepEqual(report[0].candidate_client_ids, ["email-client", "phone-client"]);
  assert.deepEqual(report[0].same_client_project_ids, ["unlinked-project"]);
  assert.equal(JSON.stringify(payload), before);
  for (const secret of ["PRIVATE", "example.com", "2125551234"]) assert.ok(!JSON.stringify(report).includes(secret));
});
test("dimension units and unresolved film identities are explicit; paid snapshots do not replace payment records", () => {
  const item = reconcileLegacyProjectReferences(payload, refs)[0];
  assert.equal(item.openings[0].source_unit, "mm");
  assert.equal(item.openings[0].width_mm, 254);
  assert.equal(item.openings[0].film_mapping, "explicit_mapping_required");
  assert.deepEqual(item.openings[0].candidate_film_ids, []);
  assert.equal(item.openings[0].catalog_price_per_sqft, 12);
  assert.equal(item.financial_evidence.payment_sum, 100);
  assert.equal(item.financial_evidence.paid_disagrees_with_records, true);
  assert.equal(item.financial_evidence.reconciliation_complete, false);
});
test("missing and malformed amounts remain unknown and old paid-only history remains visible", () => {
  const report = reconcileLegacyProjectReferences({ orders: [
    { id: "a", paid: 80 },
    { id: "b", payments: [{ amount: "" }, { amount: "bad" }, { amount: false }] },
  ] }, refs);
  assert.equal(report[0].financial_evidence.paid_without_payment_records, true);
  assert.equal(report[1].financial_evidence.payment_sum, null);
  assert.equal(report[1].financial_evidence.malformed_payment_amounts, 3);
  assert.equal(report[1].financial_evidence.legacy_paid, null);
});
test("an empty new order is preserved as draft; completed or imported history cannot become an empty draft", () => {
  const source = { clients: [{ id: "client" }], orders: ["new", "completed"].map((status, i) => ({ id: String(i), status, clientId: "client", managerId: "manager" })) };
  const report = auditLegacyProjectMigration(source, 1, { users: [{ user_id: "user", legacy_user_ids: ["manager"] }], proposals: [] });
  assert.equal(report.items[0].disposition, "preserve_draft");
  assert.equal(report.items[0].scope_basis, "empty_draft");
  assert.ok(report.items[1].blockers.includes("missing_service_scope"));
});
