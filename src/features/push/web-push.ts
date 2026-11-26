import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";

/**
 * Web Push without a paid service and without a package: the payload is
 * encrypted for the browser (RFC 8291, aes128gcm) and the request is signed
 * with the CRM's own VAPID key (RFC 8292). Apple, Google and Mozilla run the
 * push services themselves, free of charge.
 */

export type VapidKeys = {
  /** Uncompressed P-256 public key, base64url (65 bytes). */
  publicKey: string;
  /** P-256 private scalar, base64url (32 bytes). */
  privateKey: string;
  /** "mailto:…" or an https URL the push service can contact. */
  subject: string;
};

export type BrowserSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendResult = {
  ok: boolean;
  status: number;
  /** The browser unsubscribed or the subscription expired: delete it. */
  gone: boolean;
  error?: string;
};

export function base64UrlEncode(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - (normalized.length % 4)) % 4), "base64");
}

function hmac(key: Buffer, data: Buffer) {
  return createHmac("sha256", key).update(data).digest();
}

/** Keys in the same format `npx web-push generate-vapid-keys` prints. */
export function generateVapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: base64UrlEncode(ecdh.getPublicKey()),
    privateKey: base64UrlEncode(ecdh.getPrivateKey()),
  };
}

export function vapidPrivateKeyObject(keys: Pick<VapidKeys, "publicKey" | "privateKey">): KeyObject {
  const publicKey = base64UrlDecode(keys.publicKey);
  const privateKey = base64UrlDecode(keys.privateKey);
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) throw new Error("vapid_public_key_invalid");
  if (privateKey.length !== 32) throw new Error("vapid_private_key_invalid");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKey),
      x: base64UrlEncode(publicKey.subarray(1, 33)),
      y: base64UrlEncode(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** True when both keys parse and belong together. */
export function vapidKeysValid(keys: Pick<VapidKeys, "publicKey" | "privateKey">) {
  try {
    vapidPrivateKeyObject(keys);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(base64UrlDecode(keys.privateKey));
    return ecdh.getPublicKey().equals(base64UrlDecode(keys.publicKey));
  } catch {
    return false;
  }
}

/** VAPID "Authorization" header value for one push service origin. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: keys.subject })),
  );
  const unsigned = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: vapidPrivateKeyObject(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypts one message for one browser (RFC 8291). `salt` and `senderKeys`
 * are only passed by tests; in use both are fresh for every message.
 */
export function encryptPushPayload(
  subscription: Pick<BrowserSubscription, "p256dh" | "auth">,
  payload: Buffer,
  options: { salt?: Buffer; senderPrivateKey?: Buffer } = {},
) {
  const uaPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("subscription_key_invalid");
  if (authSecret.length < 16) throw new Error("subscription_auth_invalid");

  const sender = createECDH("prime256v1");
  if (options.senderPrivateKey) sender.setPrivateKey(options.senderPrivateKey);
  else sender.generateKeys();
  const asPublic = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);

  const salt = options.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // One record: the message, then the 0x02 "last record" delimiter.
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

/**
 * The server only ever posts to the browser makers' push services, never to
 * an address an employee's browser could make up.
 */
const PUSH_SERVICE_HOSTS = [/^fcm\.googleapis\.com$/, /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/];

export function isPushServiceEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && !url.username && PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

/** Checks what a browser sent before it is stored. */
export function validBrowserSubscription(value: unknown): BrowserSubscription | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof raw.endpoint === "string" ? raw.endpoint.trim() : "";
  const p256dh = typeof raw.keys?.p256dh === "string" ? raw.keys.p256dh.trim() : "";
  const auth = typeof raw.keys?.auth === "string" ? raw.keys.auth.trim() : "";
  if (!endpoint || endpoint.length > 1000 || !isPushServiceEndpoint(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return null;
  const key = base64UrlDecode(p256dh);
  if (key.length !== 65 || key[0] !== 0x04 || base64UrlDecode(auth).length < 16) return null;
  return { endpoint, p256dh, auth };
}

/** A push is a few hundred bytes; the services accept up to 4 KB. */
export const MAX_PUSH_PAYLOAD_BYTES = 3000;

export async function sendWebPush(
  subscription: BrowserSubscription,
  message: Record<string, unknown>,
  keys: VapidKeys,
  options: { ttlSeconds?: number; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PushSendResult> {
  const payload = Buffer.from(JSON.stringify(message));
  if (payload.length > MAX_PUSH_PAYLOAD_BYTES) return { ok: false, status: 0, gone: false, error: "payload_too_large" };

  let endpoint: URL;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    return { ok: false, status: 0, gone: true, error: "endpoint_invalid" };
  }
  if (!isPushServiceEndpoint(endpoint.toString())) return { ok: false, status: 0, gone: true, error: "endpoint_not_push_service" };

  let body: Buffer;
  try {
    body = encryptPushPayload(subscription, payload);
  } catch (error) {
    return { ok: false, status: 0, gone: true, error: error instanceof Error ? error.message : "encrypt_failed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint.toString(), {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(endpoint.toString(), keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: controller.signal,
    });
    const gone = response.status === 404 || response.status === 410;
    return { ok: response.status >= 200 && response.status < 300, status: response.status, gone, error: gone || response.ok ? undefined : `http_${response.status}` };
  } catch {
    return { ok: false, status: 0, gone: false, error: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
