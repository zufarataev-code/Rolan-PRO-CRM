import assert from "node:assert/strict";
import test from "node:test";

import { resolveConversationReferences, resolveTwilioStatusUpdate } from "./service";

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
