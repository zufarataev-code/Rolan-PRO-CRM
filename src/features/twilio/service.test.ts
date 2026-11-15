import assert from "node:assert/strict";
import test from "node:test";

import { detectTwilioChannel, resolveConversationReferences, resolveTwilioStatusUpdate, twilioWhatsAppAddress, isWhatsAppWindowOpen, extractTwilioMedia } from "./service";

test("checks WhatsApp window status", () => { const now = new Date(); assert.strictEqual(isWhatsAppWindowOpen(new Date(now.getTime() - 23 * 60 * 60 * 1000), now), true); assert.strictEqual(isWhatsAppWindowOpen(new Date(now.getTime() - 25 * 60 * 60 * 1000), now), false); assert.strictEqual(isWhatsAppWindowOpen(null, now), false); }); test("extracts Twilio media", () => { const mediaParams = { NumMedia: '2', MediaUrl0: 'http://example.com/0', MediaContentType0: 'image/jpeg', MediaUrl1: 'http://example.com/1', MediaContentType1: 'image/png' }; assert.deepEqual(extractTwilioMedia(mediaParams), [ { url: 'http://example.com/0', contentType: 'image/jpeg' }, { url: 'http://example.com/1', contentType: 'image/png' } ]); }); test("detects WhatsApp addresses without changing SMS numbers", () => {
  assert.equal(detectTwilioChannel("whatsapp:+18185551212"), "whatsapp");
  assert.equal(detectTwilioChannel("+18185551212"), "sms");
  assert.equal(twilioWhatsAppAddress("+1 (818) 555-1212"), "whatsapp:+18185551212");
});

test("keeps a final Twilio delivery status when callbacks arrive out of order", () => {
  assert.deepEqual(resolveTwilioStatusUpdate("undelivered", "queued", null), {
    status: "undelivered",
    errorCode: null,
  });
});

test("treats an error callback as undelivered even when Twilio reports queued", () => {
  assert.deepEqual(resolveTwilioStatusUpdate("queued", "queued", "30007"), {
    status: "undelivered",
    errorCode: "30007",
  });
});

test("allows a normal queued message to become delivered", () => {
  assert.deepEqual(resolveTwilioStatusUpdate("queued", "delivered", null), {
    status: "delivered",
    errorCode: null,
  });
});

test("threads an inbound reply to the latest outbound order when a phone is duplicated", () => {
  assert.deepEqual(
    resolveConversationReferences(
      { legacy_client_id: "client-new", legacy_order_id: "order-new" },
      { clientId: "client-old", orderId: "order-old" },
    ),
    { clientId: "client-new", orderId: "order-new" },
  );
});

test("falls back to the legacy client lookup before any outbound conversation exists", () => {
  assert.deepEqual(
    resolveConversationReferences(null, { clientId: "client-old", orderId: "order-old" }),
    { clientId: "client-old", orderId: "order-old" },
  );
});
