import assert from "node:assert/strict";
import test from "node:test";
import { auditLegacyProjectMigration, type MigrationReferences } from "./legacy-migration-audit";

const refs: MigrationReferences = {
  users: [{ user_id: "manager", legacy_user_ids: ["old-manager"] }],
  proposals: [{ proposal_id: "proposal", access_token: "private-token", project: { project_id: "project" } }],
};
const order = { id: "old-order", clientId: "old-client", managerId: "old-manager", serviceType: "solar_film", measurements: { rooms: [{ windows: [{ id: "window" }] }] } };
const payload = { orders: [order], clients: [{ id: "old-client", name: "PRIVATE NAME", phone: "PRIVATE PHONE" }], proposals: [{ orderId: "old-order", canonicalProposalId: "proposal", token: "private-token" }] };
test("migration audit uses saved proposal identity, preserves the source and does not imply migration readiness", () => {
  const before = JSON.stringify(payload);
  const report = auditLegacyProjectMigration(payload, 7, refs);
  assert.equal(JSON.stringify(payload), before);
  assert.equal(report.workspace_revision, 7);
  assert.equal(report.ready_to_migrate, false);
  assert.equal(report.items[0].disposition, "reconcile_existing_project");
  assert.deepEqual(report.items[0].candidate_project_ids, ["project"]);
  assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  assert.ok(!JSON.stringify(report).includes("private-token"));
});
test("migration audit blocks duplicate source ids and projects claimed by multiple orders", () => {
  const report = auditLegacyProjectMigration({ ...payload, orders: [order, order] }, 7, refs);
  assert.equal(report.blocked_count, 2);
  assert.ok(report.items[0].blockers.includes("duplicate_order_id"));
  assert.ok(report.items[0].blockers.includes("canonical_project_claimed_by_multiple_orders"));
});
test("migration audit refuses ambiguous employees and never guesses project matches by title", () => {
  const report = auditLegacyProjectMigration({ ...payload, proposals: [] }, 7, { ...refs, users: [...refs.users, { user_id: "another", legacy_user_ids: ["old-manager"] }] });
  assert.deepEqual(report.items[0].candidate_project_ids, []);
  assert.ok(report.items[0].blockers.includes("missing_or_ambiguous_manager_mapping"));
});
test("measured and quick scopes are flagged for reconciliation, not added together", () => {
  const report = auditLegacyProjectMigration({ ...payload, orders: [{ ...order, quickProjectImportedCompleted: true, extraServices: [{ quickProjectLine: true, serviceType: "smart_film", qty: 999, manualFilmName: "Unmapped" }] }] }, 7, refs);
  assert.equal(report.items[0].scope_basis, "measurements");
  assert.deepEqual(report.items[0].service_codes, ["SOLAR_FILM"]);
  assert.ok(report.items[0].review.includes("measured_and_quick_scope_overlap"));
  assert.ok(report.items[0].review.includes("manual_film_identity"));
});
test("a saved proposal ID and token pointing at different records block migration", () => {
  const report = auditLegacyProjectMigration(payload, 7, { ...refs, proposals: [
    { ...refs.proposals[0], access_token: "different-token" },
    { proposal_id: "other-proposal", access_token: "private-token", project: null },
  ] });
  assert.ok(report.items[0].blockers.includes("conflicting_proposal_identity"));
});
