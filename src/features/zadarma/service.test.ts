import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createZadarmaApiSignature,
  normalizeZadarmaPhone,
  validateZadarmaWebhook,
} from "./service";

test("normalizes US and international Zadarma phone numbers", () => {
  assert.equal(normalizeZadarmaPhone("(818) 555-1234"), "+18185551234");
  assert.equal(normalizeZadarmaPhone("+44 20 1234 5678"), "+442012345678");
});

test("creates a stable API signature regardless of parameter order", () => {
  const first = createZadarmaApiSignature("/v1/request/callback/", { from: "100", to: "+18185551234", sip: "100" }, "secret");
  const second = createZadarmaApiSignature("/v1/request/callback/", { sip: "100", to: "+18185551234", from: "100" }, "secret");
  assert.equal(first, second);
  assert.notEqual(first, "");
});

test("validates signed incoming and outgoing webhooks", () => {
  const previous = process.env.ZADARMA_API_SECRET;
  process.env.ZADARMA_API_SECRET = "webhook-secret";
  try {
    const incoming = { event: "NOTIFY_END", caller_id: "18185551234", called_did: "18005550101", call_start: "123" };
    const outgoing = { event: "NOTIFY_OUT_END", internal: "100", destination: "18185551234", call_start: "456" };
    const sign = (source: string) => createHmac("sha1", "webhook-secret").update(source).digest("base64");
    assert.equal(validateZadarmaWebhook(incoming, sign("1818555123418005550101123")), true);
    assert.equal(validateZadarmaWebhook(outgoing, sign("10018185551234456")), true);
    assert.equal(validateZadarmaWebhook(incoming, "wrong"), false);
  } finally {
    if (previous === undefined) delete process.env.ZADARMA_API_SECRET;
    else process.env.ZADARMA_API_SECRET = previous;
  }
});
