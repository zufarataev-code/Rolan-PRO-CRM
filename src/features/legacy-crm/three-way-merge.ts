type JsonObject = Record<string, unknown>;

const MISSING = Symbol("missing");
type MergeValue = unknown | typeof MISSING;

export type LegacyWorkspaceMergeResult =
  | { ok: true; value: unknown }
  | { ok: false; conflictPaths: string[] };

function isObject(value: MergeValue): value is JsonObject {
  return value !== MISSING && value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left: MergeValue, right: MergeValue): boolean {
  if (left === MISSING || right === MISSING) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function pathChild(path: string, key: string) {
  return path ? `${path}.${key}` : key;
}

function stableIdArray(value: unknown[]): value is Array<JsonObject & { id: string }> {
  const ids = value.map((item) =>
    isObject(item) && typeof item.id === "string" ? item.id.trim() : "",
  );
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function mergeIdArray(
  base: Array<JsonObject & { id: string }>,
  local: Array<JsonObject & { id: string }>,
  remote: Array<JsonObject & { id: string }>,
  path: string,
  conflicts: string[],
) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const order = [
    ...remote.map((item) => item.id),
    ...local.map((item) => item.id).filter((id) => !remoteById.has(id)),
  ];

  const merged: unknown[] = [];
  for (const id of order) {
    const value = mergeValue(
      baseById.get(id) ?? MISSING,
      localById.get(id) ?? MISSING,
      remoteById.get(id) ?? MISSING,
      `${path}[id=${id}]`,
      conflicts,
    );
    if (value !== MISSING) merged.push(value);
  }
  return merged;
}

function mergeValue(
  base: MergeValue,
  local: MergeValue,
  remote: MergeValue,
  path: string,
  conflicts: string[],
): MergeValue {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;

  if (isObject(base) && isObject(local) && isObject(remote)) {
    const merged: JsonObject = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = mergeValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        pathChild(path, key),
        conflicts,
      );
      if (value !== MISSING) merged[key] = value;
    }
    return merged;
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if (stableIdArray(base) && stableIdArray(local) && stableIdArray(remote)) {
      return mergeIdArray(base, local, remote, path, conflicts);
    }
  }

  conflicts.push(path || "payload");
  return remote;
}

export function mergeLegacyWorkspacePayload(
  base: unknown,
  local: unknown,
  remote: unknown,
): LegacyWorkspaceMergeResult {
  const conflicts: string[] = [];
  const value = mergeValue(base, local, remote, "", conflicts);
  if (conflicts.length) {
    return { ok: false, conflictPaths: [...new Set(conflicts)].sort() };
  }
  return { ok: true, value };
}
