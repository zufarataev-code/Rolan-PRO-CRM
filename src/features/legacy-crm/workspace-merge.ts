type JsonRecord = Record<string, unknown>;

function cloneWorkspaceValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function workspaceValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isWorkspaceRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasStableIds(values: unknown[]) {
  return values.every((value) =>
    isWorkspaceRecord(value) && (typeof value.id === "string" || typeof value.id === "number"),
  );
}

function isArrayPrefix(prefix: unknown[], values: unknown[]) {
  return prefix.length <= values.length && prefix.every((value, index) =>
    workspaceValuesEqual(value, values[index]),
  );
}

function mergeAppendOnlyArrays(base: unknown[], local: unknown[], remote: unknown[]) {
  if (!isArrayPrefix(base, local) || !isArrayPrefix(base, remote)) return null;

  const merged = cloneWorkspaceValue(remote);
  const seen = new Set(merged.map((value) => JSON.stringify(value)));
  local.slice(base.length).forEach((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(cloneWorkspaceValue(value));
  });
  return merged;
}

function mergeWorkspaceRecords(base: JsonRecord, local: JsonRecord, remote: JsonRecord) {
  const result: JsonRecord = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)]);

  keys.forEach((key) => {
    const baseHas = Object.prototype.hasOwnProperty.call(base, key);
    const localHas = Object.prototype.hasOwnProperty.call(local, key);
    const remoteHas = Object.prototype.hasOwnProperty.call(remote, key);

    if (!localHas) {
      if (!baseHas && remoteHas) result[key] = cloneWorkspaceValue(remote[key]);
      return;
    }
    if (!remoteHas) {
      if (!baseHas || !workspaceValuesEqual(local[key], base[key])) {
        result[key] = cloneWorkspaceValue(local[key]);
      }
      return;
    }
    if (!baseHas) {
      result[key] = workspaceValuesEqual(local[key], remote[key])
        ? cloneWorkspaceValue(local[key])
        : mergeWorkspaceSnapshots(undefined, local[key], remote[key]);
      return;
    }
    result[key] = mergeWorkspaceSnapshots(base[key], local[key], remote[key]);
  });

  return result;
}

function mergeWorkspaceArrays(base: unknown[], local: unknown[], remote: unknown[]) {
  const combined = [...base, ...local, ...remote];
  if (!hasStableIds(combined)) {
    return mergeAppendOnlyArrays(base, local, remote) ?? cloneWorkspaceValue(local);
  }

  const byId = (values: unknown[]) => new Map(values.map((value) => [
    String((value as JsonRecord).id),
    value,
  ]));
  const baseById = byId(base);
  const localById = byId(local);
  const remoteById = byId(remote);
  const orderedIds = [
    ...remote.map((value) => String((value as JsonRecord).id)),
    ...local.map((value) => String((value as JsonRecord).id)),
  ].filter((id, index, values) => values.indexOf(id) === index);

  return orderedIds.flatMap((id) => {
    const baseHas = baseById.has(id);
    const localHas = localById.has(id);
    const remoteHas = remoteById.has(id);

    if (!localHas) return baseHas ? [] : [cloneWorkspaceValue(remoteById.get(id))];
    if (!remoteHas) {
      if (baseHas && workspaceValuesEqual(localById.get(id), baseById.get(id))) return [];
      return [cloneWorkspaceValue(localById.get(id))];
    }
    if (!baseHas) {
      return [workspaceValuesEqual(localById.get(id), remoteById.get(id))
        ? cloneWorkspaceValue(localById.get(id))
        : mergeWorkspaceSnapshots(undefined, localById.get(id), remoteById.get(id))];
    }
    return [mergeWorkspaceSnapshots(
      baseById.get(id),
      localById.get(id),
      remoteById.get(id),
    )];
  });
}

export function mergeWorkspaceSnapshots(base: unknown, local: unknown, remote: unknown): unknown {
  if (workspaceValuesEqual(local, base)) return cloneWorkspaceValue(remote);
  if (workspaceValuesEqual(remote, base) || workspaceValuesEqual(local, remote)) {
    return cloneWorkspaceValue(local);
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeWorkspaceArrays(base, local, remote);
  }
  if (isWorkspaceRecord(base) && isWorkspaceRecord(local) && isWorkspaceRecord(remote)) {
    return mergeWorkspaceRecords(base, local, remote);
  }

  // Both sides changed the same scalar value. The active tab wins so its user's
  // explicit edit is never discarded by a background save from another tab.
  return cloneWorkspaceValue(local);
}
