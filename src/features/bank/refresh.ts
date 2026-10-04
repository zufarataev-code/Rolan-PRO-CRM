/**
 * Opening «Счета и карты» refreshes operations when any bank never loaded or
 * loaded too long ago. A bank waiting for a new login cannot load until the
 * owner signs in again, so it does not trigger a refresh.
 */
export function bankNeedsRefresh(
  connections: ReadonlyArray<{ status: string; lastSyncedAt: string | null }>,
  now: number,
  maxAgeMs: number,
) {
  return connections.some((connection) => connection.status !== "login_required"
    && (!connection.lastSyncedAt || now - Date.parse(connection.lastSyncedAt) > maxAgeMs));
}
