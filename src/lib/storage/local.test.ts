import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { localMediaPath, localSignedUrl, verifyLocalSignedUrl } from "./local";

// Owner, 2026-11-23: «по WhatsApp не могу отправлять файлы» — the server had no object storage keys.
const key = "crm/whatsapp/2026-11/abc-photo.jpg";
const params = (url: string) => new URL(url, "https://crm.example").searchParams;

test("a signed link opens only its own file, method and time", () => {
  const now = new Date("2026-11-23T15:00:00Z");
  const put = localSignedUrl({ method: "PUT", key, expiresSeconds: 900, now });
  assert.equal(verifyLocalSignedUrl(params(put), "PUT", now), key);
  assert.equal(verifyLocalSignedUrl(params(put), "GET", now), null, "an upload link does not download");
  assert.equal(verifyLocalSignedUrl(params(put), "PUT", new Date("2026-11-23T15:16:00Z")), null, "expired");
  const forged = params(put); forged.set("key", "crm/whatsapp/2026-11/other.jpg");
  assert.equal(verifyLocalSignedUrl(forged, "PUT", now), null, "another file");
  const get = localSignedUrl({ method: "GET", key, expiresSeconds: 3600, baseUrl: "https://crm.example/", now });
  assert.match(get, /^https:\/\/crm\.example\/api\/public\/files\?/);
});

test("a key never leaves the media folder", () => {
  assert.ok(localMediaPath(key).endsWith("/crm/whatsapp/2026-11/abc-photo.jpg"));
  assert.throws(() => localMediaPath("crm/../../etc/passwd"));
  assert.throws(() => localMediaPath("/etc/passwd"));
});

test("uploads, staff view and WhatsApp use the server disk when Spaces has no keys", () => {
  assert.match(readFileSync("app/api/v1/files/upload-url/route.ts", "utf8"), /: localSignedUrl\(\{ method: "PUT", key, expiresSeconds: 15 \* 60 \}\)/);
  assert.match(readFileSync("app/api/v1/files/view/route.ts", "utf8"), /if \(!config\) \{\s*const local = localSignedUrl\(\{ method: "GET"/);
  assert.match(readFileSync("src/features/twilio/service.ts", "utf8"), /localSignedUrl\(\{ method: "GET", key: item\.key, expiresSeconds: 3600, baseUrl: config\.publicBaseUrl \}\)/);
  const route = readFileSync("app/api/public/files/route.ts", "utf8");
  assert.match(route, /verifyLocalSignedUrl\(request\.nextUrl\.searchParams, "PUT"\)/);
  assert.match(route, /verifyLocalSignedUrl\(request\.nextUrl\.searchParams, "GET"\)/);
  assert.match(route, /isAllowedMediaType\(contentType\)/);
});
