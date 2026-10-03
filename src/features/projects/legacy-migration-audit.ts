import { createHash } from "node:crypto";

type Row = Record<string, unknown>;
export type MigrationReferences = {
  users: Array<{ user_id: string; legacy_user_ids: string[] }>;
  proposals: Array<{ proposal_id: string; access_token: string; project: { project_id: string } | null }>;
};
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const text = (value: unknown) => typeof value === "string" ? value : "";
const serviceCodes: Record<string, string> = {
  solar_film: "SOLAR_FILM", smart_film: "SMART_FILM", protective_film: "SAFETY_FILM", decorative_film: "DECORATIVE_FILM",
};

/** Read-only inventory, NOT an import plan that can be applied. No name/address guessing. */
export function auditLegacyProjectMigration(payload: unknown, revision: number, refs: MigrationReferences) {
  const workspace = row(payload);
  const orders = rows(workspace.orders);
  const clients = rows(workspace.clients);
  const proposals = rows(workspace.proposals);
  const idCounts = new Map<string, number>();
  orders.forEach(order => idCounts.set(text(order.id), (idCounts.get(text(order.id)) ?? 0) + 1));
  const items = orders.map((order, index) => {
    const blockers: string[] = [];
    const orderId = text(order.id);
    if (!orderId) blockers.push("missing_order_id");
    if ((idCounts.get(orderId) ?? 0) > 1) blockers.push("duplicate_order_id");
    const clientMatches = clients.filter(client => text(client.id) && client.id === order.clientId);
    if (clientMatches.length !== 1) blockers.push("missing_or_ambiguous_legacy_client");
    const managerIds = refs.users.filter(user => user.legacy_user_ids.includes(text(order.managerId))).map(user => user.user_id);
    if (managerIds.length !== 1) blockers.push("missing_or_ambiguous_manager_mapping");
    const localProposals = proposals.filter(proposal => orderId && proposal.orderId === orderId);
    const canonical = refs.proposals.filter(proposal => localProposals.some(local =>
      local.canonicalProposalId === proposal.proposal_id || (text(local.token) && local.token === proposal.access_token)));
    const projectIds = [...new Set(canonical.flatMap(proposal => proposal.project ? [proposal.project.project_id] : []))];
    if (projectIds.length > 1) blockers.push("multiple_canonical_projects");
    if (localProposals.some(local => text(local.canonicalProposalId) && !refs.proposals.some(proposal => proposal.proposal_id === local.canonicalProposalId))) {
      blockers.push("missing_referenced_proposal");
    }
    if (localProposals.some(local => {
      const byId = refs.proposals.find(proposal => proposal.proposal_id === local.canonicalProposalId);
      const byToken = text(local.token) ? refs.proposals.find(proposal => proposal.access_token === local.token) : null;
      return byId && byToken && byId.proposal_id !== byToken.proposal_id;
    })) blockers.push("conflicting_proposal_identity");
    // Prefer measured scope; quick import quantities cannot be added on top of it.
    const windows = rows(row(order.measurements).rooms).flatMap(room => rows(room.windows));
    const quickLines = rows(order.extraServices).filter(line => line.quickProjectLine === true);
    const quickBasis = order.quickProjectImportedCompleted === true && windows.length === 0;
    const scope = quickBasis ? quickLines : windows;
    if (!scope.length) blockers.push("missing_service_scope");
    const services = [...new Set(scope.map(item => text(item.measureScope) || text(item.serviceType) || text(order.serviceType)))];
    if (services.some(service => !serviceCodes[service])) blockers.push("unmapped_service_type");
    const installers = [...new Set([
      ...(Array.isArray(order.installerIds) ? order.installerIds : []),
      ...quickLines.flatMap(line => Array.isArray(line.installerIds) ? line.installerIds : []),
    ].map(text).filter(Boolean))];
    if (installers.some(id => refs.users.filter(user => user.legacy_user_ids.includes(id)).length !== 1)) {
      blockers.push("missing_or_ambiguous_installer_mapping");
    }
    const review = ["client_identity", "film_and_warehouse_mapping", "service_quantities_and_prices", "payments_and_accruals", "measurements_and_attachments", "single_write_path"];
    if (windows.length && quickLines.length) review.push("measured_and_quick_scope_overlap");
    if (quickLines.some(line => text(line.manualFilmName))) review.push("manual_film_identity");
    return {
      source_index: index, legacy_order_id: orderId || null,
      source_status: text(order.status) || null,
      candidate_project_ids: projectIds,
      candidate_proposal_ids: canonical.map(proposal => proposal.proposal_id),
      candidate_manager_ids: managerIds,
      scope_basis: quickBasis ? "historical_quick_lines" : "measurements",
      measured_openings: windows.length, quick_lines: quickLines.length,
      service_codes: services.map(service => serviceCodes[service] ?? "UNKNOWN"),
      blockers, review,
      disposition: blockers.length ? "blocked" : projectIds.length ? "reconcile_existing_project" : "needs_explicit_mapping",
    };
  });
  // Two legacy records must never silently resolve into a single existing Project.
  const projectOwners = new Map<string, number>();
  items.forEach(item => item.candidate_project_ids.forEach(id => projectOwners.set(id, (projectOwners.get(id) ?? 0) + 1)));
  items.forEach(item => {
    if (item.candidate_project_ids.some(id => (projectOwners.get(id) ?? 0) > 1)) {
      item.blockers.push("canonical_project_claimed_by_multiple_orders");
      item.disposition = "blocked";
    }
  });
  return {
    mode: "read_only_inventory", workspace_revision: revision,
    source_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    order_count: orders.length, blocked_count: items.filter(item => item.blockers.length).length,
    // Never advertise readiness before finance/history reconciliation and cutover exist.
    ready_to_migrate: false,
    items,
  };
}
