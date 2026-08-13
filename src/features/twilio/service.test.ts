import assert from "node:assert/strict";
import test from "node:test";

import { resolveTwilioStatusUpdate } from "./service";

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
