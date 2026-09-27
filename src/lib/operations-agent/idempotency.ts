import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize(object[key]);
        return result;
      }, {});
  }

  return value;
}

export function buildOperationsRequestFingerprint(
  action: string,
  args: Record<string, unknown>,
) {
  return createHash("sha256")
    .update(action.trim())
    .update("\n")
    .update(JSON.stringify(normalize(args)))
    .digest("hex");
}
