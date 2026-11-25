import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from "node:crypto";
import test from "node:test";

import { pushConfig } from "./config";
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPushPayload,
  generateVapidKeys,
  isPushServiceEndpoint,
  sendWebPush,
  vapidAuthorization,
  vapidKeysValid,
  validBrowserSubscription,
} from "./web-push";

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** What the browser does with a push (RFC 8291), written out independently of the sender. */
function browserDecrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer) {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const idLength = body[20];
  const asPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  return { recordSize, idLength, text: plain.subarray(0, plain.length - 1).toString("utf8") };
}

function browserKeys() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  return { ua, auth, subscription: { p256dh: base64UrlEncode(ua.getPublicKey()), auth: base64UrlEncode(auth) } };
}

test("a push decrypts in the browser to exactly what the server sent", () => {
  const { ua, auth, subscription } = browserKeys();
  const message = JSON.stringify({ title: "Вам назначен монтаж", body: "R-1 · Иванов · 26 нояб.", url: "/legacy-crm#/order/o1" });
  const body = encryptPushPayload(subscription, Buffer.from(message));
  const opened = browserDecrypt(body, ua.getPrivateKey(), ua.getPublicKey(), auth);
  assert.equal(opened.text, message);
  assert.equal(opened.recordSize, 4096);
  assert.equal(opened.idLength, 65);
});

test("every push uses a fresh salt and sender key", () => {
  const { subscription } = browserKeys();
  const one = encryptPushPayload(subscription, Buffer.from("x"));
  const two = encryptPushPayload(subscription, Buffer.from("x"));
  assert.notDeepEqual(one.subarray(0, 16), two.subarray(0, 16));
  assert.notDeepEqual(one.subarray(21, 86), two.subarray(21, 86));
});

test("bad browser keys are refused, not sent", () => {
  assert.throws(() => encryptPushPayload({ p256dh: base64UrlEncode(Buffer.alloc(10)), auth: base64UrlEncode(randomBytes(16)) }, Buffer.from("x")));
  const { subscription } = browserKeys();
  assert.throws(() => encryptPushPayload({ ...subscription, auth: base64UrlEncode(Buffer.alloc(4)) }, Buffer.from("x")));
});

test("VAPID header is an ES256 JWT for the push service origin, signed by the CRM key", () => {
  const keys = { ...generateVapidKeys(), subject: "mailto:info@rolanpro.com" };
  assert.equal(vapidKeysValid(keys), true);
  const now = Date.UTC(2026, 10, 25, 12);
  const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, now);
  const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(match);
  const [, head, claims, signature, k] = match;
  assert.equal(k, keys.publicKey);
  assert.deepEqual(JSON.parse(base64UrlDecode(head).toString()), { typ: "JWT", alg: "ES256" });
  const body = JSON.parse(base64UrlDecode(claims).toString());
  assert.equal(body.aud, "https://fcm.googleapis.com");
  assert.equal(body.sub, "mailto:info@rolanpro.com");
  assert.equal(body.exp, now / 1000 + 12 * 3600);
  const publicKey = base64UrlDecode(keys.publicKey);
  const jwk = createPublicKey({ key: { kty: "EC", crv: "P-256", x: base64UrlEncode(publicKey.subarray(1, 33)), y: base64UrlEncode(publicKey.subarray(33)) }, format: "jwk" });
  assert.equal(verify("sha256", Buffer.from(`${head}.${claims}`), { key: jwk, dsaEncoding: "ieee-p1363" }, base64UrlDecode(signature)), true);
});

test("mismatched or broken VAPID keys switch pushes off", () => {
  const one = generateVapidKeys();
  const two = generateVapidKeys();
  assert.equal(vapidKeysValid({ publicKey: one.publicKey, privateKey: two.privateKey }), false);
  assert.equal(vapidKeysValid({ publicKey: "nope", privateKey: "nope" }), false);
  assert.equal(pushConfig({} as unknown as NodeJS.ProcessEnv), null);
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: one.publicKey, VAPID_PRIVATE_KEY: two.privateKey } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: one.publicKey, VAPID_PRIVATE_KEY: one.privateKey, PUSH_NOTIFICATIONS: "off" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: one.publicKey, VAPID_PRIVATE_KEY: one.privateKey, VAPID_SUBJECT: "info@rolanpro.com" } as unknown as NodeJS.ProcessEnv), null);
  assert.deepEqual(pushConfig({ VAPID_PUBLIC_KEY: one.publicKey, VAPID_PRIVATE_KEY: one.privateKey } as unknown as NodeJS.ProcessEnv), { ...one, subject: "mailto:info@rolanpro.com" });
});

test("the server only posts to the browser makers' push services", () => {
  assert.equal(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isPushServiceEndpoint("https://web.push.apple.com/QGx"), true);
  assert.equal(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isPushServiceEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x"), true);
  assert.equal(isPushServiceEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
  assert.equal(isPushServiceEndpoint("https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(isPushServiceEndpoint("https://169.254.169.254/latest"), false);
  assert.equal(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x"), false);
  assert.equal(isPushServiceEndpoint("https://localhost/x"), false);
});

test("a browser subscription is checked before it is stored", () => {
  const { subscription } = browserKeys();
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: subscription };
  assert.deepEqual(validBrowserSubscription(good), { endpoint: good.endpoint, ...subscription });
  assert.equal(validBrowserSubscription({ ...good, endpoint: "https://example.com/hook" }), null);
  assert.equal(validBrowserSubscription({ ...good, keys: { p256dh: subscription.p256dh } }), null);
  assert.equal(validBrowserSubscription({ ...good, keys: { ...subscription, p256dh: "abc" } }), null);
  assert.equal(validBrowserSubscription(null), null);
});

test("sendWebPush posts an encrypted aes128gcm body with VAPID and reports gone devices", async () => {
  const keys = { ...generateVapidKeys(), subject: "mailto:info@rolanpro.com" };
  const { ua, auth, subscription } = browserKeys();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: calls.length === 1 ? 201 : 410 });
  }) as unknown as typeof fetch;
  const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...subscription };

  const sent = await sendWebPush(target, { title: "Новый лид" }, keys, { fetchImpl });
  assert.deepEqual(sent, { ok: true, status: 201, gone: false, error: undefined });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Content-Encoding"], "aes128gcm");
  assert.equal(headers.TTL, "86400");
  assert.match(headers.Authorization, /^vapid t=.+, k=/);
  const opened = browserDecrypt(Buffer.from(calls[0].init.body as Uint8Array), ua.getPrivateKey(), ua.getPublicKey(), auth);
  assert.deepEqual(JSON.parse(opened.text), { title: "Новый лид" });

  const gone = await sendWebPush(target, { title: "x" }, keys, { fetchImpl });
  assert.equal(gone.gone, true);
  assert.equal(gone.ok, false);

  const elsewhere = await sendWebPush({ ...target, endpoint: "https://example.com/x" }, { title: "x" }, keys, { fetchImpl });
  assert.equal(elsewhere.error, "endpoint_not_push_service");
  assert.equal(calls.length, 2, "nothing is posted to a non-push address");

  const large = await sendWebPush(target, { body: "x".repeat(4000) }, keys, { fetchImpl });
  assert.equal(large.error, "payload_too_large");
});
