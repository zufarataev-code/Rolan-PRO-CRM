import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import worker from "../../../integrations/callrail-worker/worker";

const endpoint = "https://rolan-pro.com/integrations/callrail";
const raw = '{ "company_id": 123, "name": "offline \\u00e9 fixture" }';
const signature = createHmac("sha1", "offline-key").update(raw).digest("base64");
function request(body = raw, headers: Record<string, string> = {}) {
  return new Request(endpoint, { method: "POST", headers: { Signature: signature, ...headers }, body });
}
test("CallRail relay preserves signed bytes and forwards only to the fixed receiver without ambient credentials", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://rolanpro-crm.143-110-136-211.sslip.io/api/webhooks/callrail");
    assert.equal(Buffer.from(init.body as Uint8Array).toString(), raw);
    assert.equal(createHmac("sha1", "offline-key").update(init.body as Uint8Array).digest("base64"), signature);
    assert.deepEqual(init.headers, { "Content-Type": "application/json", Signature: signature });
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal);
    return new Response('{"ok":false,"error":"invalid_call"}', { status: 400, headers: { "Set-Cookie": "must-not-cross=1" } });
  });
  for (const host of ["rolan-pro.com", "callrail.rolan-pro.com"]) {
    const req = new Request(`https://${host}/integrations/callrail?contact=must-not-forward`, { method: "POST", headers: { Signature: signature, Cookie: "private=1", Authorization: "must-not-cross" }, body: raw });
    const res = await worker.fetch(req);
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { ok: false, error: "invalid_call" });
  }
  assert.equal(calls, 2);
});
test("wrong host/path, unsupported methods and unsigned input never reach CRM", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null); });
  for (const [req, status] of [
    [new Request("https://other.example/integrations/callrail"), 404],
    [new Request("http://rolan-pro.com/integrations/callrail"), 404],
    [new Request("http://callrail.rolan-pro.com/integrations/callrail"), 404],
    [new Request("https://callrail.rolan-pro.com/other"), 404],
    [new Request(endpoint + "/other"), 404],
    [new Request(endpoint), 405],
    [request(raw, { Signature: "invalid" }), 401],
  ] as const) assert.equal((await worker.fetch(req)).status, status);
  assert.equal(calls, 0);
});
test("oversize or broken bodies are rejected before forwarding, including absent content-length", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null); });
  assert.equal((await worker.fetch(request(raw, { "Content-Length": String(128 * 1024 + 1) }))).status, 413);
  assert.equal((await worker.fetch(request("x".repeat(128 * 1024 + 1)))).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("offline stream failure")); } });
  const broken = new Request(endpoint, { method: "POST", headers: { Signature: signature }, body: stream, duplex: "half" } as RequestInit);
  assert.equal((await worker.fetch(broken)).status, 400);
  assert.equal(calls, 0);
});
test("receiver network failures return a generic retryable status without exposing errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("private network detail"); });
  const res = await worker.fetch(request());
  assert.equal(res.status, 502);
  assert.equal(await res.text(), "");
});
