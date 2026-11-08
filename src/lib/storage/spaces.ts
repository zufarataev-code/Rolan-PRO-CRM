import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * DigitalOcean Spaces (S3-compatible) storage for CRM photos and videos.
 * Originals are uploaded straight from the browser with a short-lived
 * presigned PUT, so large files never pass through the CRM server and are
 * never recompressed. The bucket stays private; viewing goes through a
 * session-checked redirect to a short-lived presigned GET.
 */

export type SpacesConfig = {
  endpoint: string; // e.g. https://sfo3.digitaloceanspaces.com
  region: string; // e.g. sfo3
  bucket: string; // e.g. rolanpro-media
  accessKey: string;
  secretKey: string;
};

export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3; // 5 GB — one long 4K video

export function getSpacesConfig(): SpacesConfig | null {
  const accessKey = process.env.SPACES_ACCESS_KEY?.trim();
  const secretKey = process.env.SPACES_SECRET_KEY?.trim();
  const bucket = process.env.SPACES_BUCKET?.trim() || "rolanpro-media";
  const region = process.env.SPACES_REGION?.trim() || "sfo3";
  const endpoint = (process.env.SPACES_ENDPOINT?.trim() || `https://${region}.digitaloceanspaces.com`).replace(/\/$/, "");
  if (!accessKey || !secretKey) return null;
  return { endpoint, region, bucket, accessKey, secretKey };
}

const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const encodeKey = (key: string) => key.split("/").map(encode).join("/");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { stamp: iso, day: iso.slice(0, 8) };
}

/**
 * AWS Signature V4 query-string presign (virtual-hosted bucket style).
 * `host` is signed; other request headers (Content-Type) are left free so
 * the browser can send the file's real type.
 */
export function presignUrl(input: {
  config: SpacesConfig;
  method: "GET" | "PUT" | "HEAD";
  key: string;
  expiresSeconds: number;
  now?: Date;
  extraQuery?: Record<string, string>;
}) {
  const { config } = input;
  const host = `${config.bucket}.${new URL(config.endpoint).host}`;
  const { stamp, day } = amzDate(input.now ?? new Date());
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKey}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
    ...(input.extraQuery ?? {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name])}`)
    .join("&");
  const path = `/${encodeKey(input.key)}`;
  const canonicalRequest = [input.method, path, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, day), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

export function buildStorageKey(input: { scope: string; fileName: string; now?: Date; id?: string }) {
  const now = input.now ?? new Date();
  const scope = input.scope.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "general";
  const dot = input.fileName.lastIndexOf(".");
  const base = (dot > 0 ? input.fileName.slice(0, dot) : input.fileName).replace(SAFE_SEGMENT, "-").slice(0, 60) || "file";
  const ext = dot > 0 ? input.fileName.slice(dot + 1).replace(SAFE_SEGMENT, "").slice(0, 10).toLowerCase() : "";
  const month = now.toISOString().slice(0, 7);
  return `crm/${scope}/${month}/${input.id ?? randomUUID()}-${base}${ext ? `.${ext}` : ""}`;
}

export function isValidStorageKey(key: string) {
  return /^crm\/[a-zA-Z0-9._-]+\/\d{4}-\d{2}\/[a-zA-Z0-9._-]+$/.test(key) && !key.includes("..");
}

export function isAllowedMediaType(contentType: string) {
  return /^(image|video)\/[a-z0-9.+-]+$/i.test(contentType) || contentType === "application/pdf";
}
