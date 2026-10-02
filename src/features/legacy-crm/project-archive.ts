/**
 * Project archive (Owner, 2026-10-02): only the owner deletes projects, and a
 * deleted project is kept in `archivedOrders`, never erased. The server holds
 * this rule for every privileged save:
 *  - a project in the archive is never also in `orders` (archive wins over a
 *    stale browser that still edits it);
 *  - a non-owner cannot change the archive or drop a project from `orders`.
 */
type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

const idOf = (record: JsonRecord) => String(record.id ?? "");

export function enforceProjectArchive<T extends JsonRecord>(current: JsonRecord, next: T, isOwner: boolean): T {
  const archive = records(isOwner ? next.archivedOrders : current.archivedOrders);
  const archivedIds = new Set(archive.map(idOf).filter(Boolean));
  const orders = records(next.orders).filter((order) => !archivedIds.has(idOf(order)));
  if (!isOwner) {
    const kept = new Set(orders.map(idOf));
    for (const order of records(current.orders)) {
      const id = idOf(order);
      if (id && !kept.has(id) && !archivedIds.has(id)) orders.push(order);
    }
  }
  return { ...next, orders, archivedOrders: archive };
}
