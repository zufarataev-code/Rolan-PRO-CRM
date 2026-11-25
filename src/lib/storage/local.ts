import { createHmac, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { getEnv } from "@/lib/env";
import { isValidStorageKey } from "@/lib/storage/spaces";

/**
 * Files on the CRM server's own disk when no paid object storage is set up
 * (Owner, 2026-11-23: «по WhatsApp не могу отправлять файлы»; no new paid services).
 * The folder lives outside the release folders, so a deploy keeps the files.
 * Upload and download go through signed, short-lived links like the Spaces ones,
 * so Twilio can fetch a file without a CRM session.
 */
export const LOCAL_MAX_UPLOAD_BYTES = 200 * 1024 ** 2; // photos, PDFs, short videos

export function localMediaDir() {
  return path.resolve(process.env.LOCAL_MEDIA_DIR?.trim() || path.join(homedir(), "rolanpro-crm-media"));
}

export function localMediaPath(key: string) {
  if (!isValidStorageKey(key)) throw new Error("Invalid file key.");
  const root = localMediaDir();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid file key.");
  return full;
}

type Method = "GET" | "PUT";

function signature(method: Method, key: string, exp: number) {
  return createHmac("sha256", getEnv().authSecret).update(`local-media\n${method}\n${key}\n${exp}`).digest("hex");
}

/** `/api/public/files?...` — relative unless a public base URL is given (Twilio needs an absolute one). */
export function localSignedUrl(input: { method: Method; key: string; expiresSeconds: number; baseUrl?: string; now?: Date }) {
  const exp = Math.floor((input.now ?? new Date()).getTime() / 1000) + input.expiresSeconds;
  const query = new URLSearchParams({ key: input.key, m: input.method, exp: String(exp), sig: signature(input.method, input.key, exp) });
  return `${(input.baseUrl ?? "").replace(/\/$/, "")}/api/public/files?${query.toString()}`;
}

export function verifyLocalSignedUrl(params: URLSearchParams, method: Method, now = new Date()) {
  const key = params.get("key") ?? "";
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (params.get("m") !== method || !isValidStorageKey(key) || !Number.isFinite(exp)) return null;
  if (exp < Math.floor(now.getTime() / 1000)) return null;
  const expected = Buffer.from(signature(method, key, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return key;
}
