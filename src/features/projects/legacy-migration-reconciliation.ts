import { matchClientIdentity } from "../sales/client-identity";

type Row = Record<string, unknown>;
export type ReconciliationReferences = {
  clients: Array<{ client_id: string; email: string | null; phone: string | null }>;
  projects: Array<{ project_id: string; client_id: string }>;
  films: Array<{ film_id: string }>;
};
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const text = (value: unknown) => typeof value === "string" ? value : "";
// Absence and malformed amounts must not silently turn into zero.
const number = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const sum = (values: Array<number | null>) => values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);

/** Evidence only. Contact values and free text never leave this function. */
export function reconcileLegacyProjectReferences(payload: unknown, refs: ReconciliationReferences) {
  const workspace = row(payload);
  const clients = rows(workspace.clients);
  const catalog = rows(row(workspace.settings).catalog);
  return rows(workspace.orders).map(order => {
    const sourceClients = clients.filter(client => text(client.id) && client.id === order.clientId);
    const client = sourceClients.length === 1 ? sourceClients[0] : {};
    const candidates = refs.clients.filter(candidate => matchClientIdentity(candidate, {
      email: text(client.email), phone: text(client.phone),
    }));
    const windows = rows(row(order.measurements).rooms).flatMap(room => rows(room.windows));
    const payments = rows(order.payments);
    const paid = number(order.paid);
    const paymentSum = sum(payments.map(payment => number(payment.amount)));
    return {
      legacy_order_id: text(order.id) || null,
      candidate_client_ids: candidates.map(candidate => candidate.client_id),
      client_mapping: sourceClients.length !== 1 ? "invalid_source" : candidates.length > 1 ? "ambiguous" : candidates.length === 1 ? "contact_match_requires_review" : "no_contact_match",
      // Same client is a collision check, NEVER authority to attach an order.
      same_client_project_ids: refs.projects.filter(project => candidates.some(candidate => candidate.client_id === project.client_id)).map(project => project.project_id),
      openings: windows.map(window => {
        const catalogId = text(window.catalogId);
        const catalogMatches = catalog.filter(item => catalogId && item.id === catalogId);
        // Only actual UUID identity is evidence. A model/name match is insufficient.
        const filmIds = refs.films.filter(film => catalogId && film.film_id === catalogId).map(film => film.film_id);
        return {
          legacy_opening_id: text(window.id) || null,
          legacy_catalog_id: catalogId || null,
          legacy_catalog_matches: catalogMatches.length,
          candidate_film_ids: filmIds,
          film_mapping: filmIds.length === 1 ? "exact_id_requires_review" : "explicit_mapping_required",
          source_unit: "mm",
          width_mm: number(window.width), height_mm: number(window.height), quantity: number(window.qty),
          actual_width_mm: number(window.actualWidth), actual_height_mm: number(window.actualHeight), actual_quantity: number(window.actualQty),
          panels: rows(window.panels).map(panel => ({ width_mm: number(panel.width), height_mm: number(panel.height) })),
          has_actual_panels: window.actualPanels != null,
          // Keep the source claim distinct from evidence of verification.
          claims_verified: window.measurementSource === "SURVEYOR_VERIFIED" || window.measurement_source === "SURVEYOR_VERIFIED",
          has_verifier: Boolean(text(window.measurementVerifiedBy)),
          has_verification_time: Boolean(text(window.measurementVerifiedAt)),
          explicit_price_per_sqft: number(window.pricePerSqft),
          catalog_price_per_sqft: catalogMatches.length === 1 ? number(catalogMatches[0].retailPerSqft) : null,
        };
      }),
      financial_evidence: {
        payment_count: payments.length,
        payment_sum: paymentSum,
        legacy_paid: paid,
        paid_without_payment_records: payments.length === 0 && paid !== null && paid !== 0,
        paid_disagrees_with_records: payments.length > 0 && paid !== null && paymentSum !== null && Math.abs(paid - paymentSum) > 0.005,
        malformed_payment_amounts: payments.filter(payment => number(payment.amount) === null).length,
        explicit_order_price_per_sqft: number(order.priceOverridePerSqft),
        extra_service_count: rows(order.extraServices).length,
        extra_service_price_sum: sum(rows(order.extraServices).map(service => number(service.price))),
        expense_count: rows(order.extraExpenses).length,
        expense_amount_sum: sum(rows(order.extraExpenses).map(expense => number(expense.amount))),
        reconciliation_complete: false,
      },
    };
  });
}
