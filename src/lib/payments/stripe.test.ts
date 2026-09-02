import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyWebhookSignature } from "./stripe";

const SECRET = "whsec_test_secret";

function signPayload(payload: string, timestamp: number, secret = SECRET) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

test("подлинная подпись принимается", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);

  assert.equal(await verifyWebhookSignature(payload, signPayload(payload, timestamp)), true);
});

test("подпись чужим ключом отклоняется", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);

  assert.equal(
    await verifyWebhookSignature(payload, signPayload(payload, timestamp, "wrong_secret")),
    false,
  );
});

test("изменённое тело запроса отклоняется", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  const timestamp = Math.floor(Date.now() / 1000);
  const header = signPayload(JSON.stringify({ amount: 100 }), timestamp);

  assert.equal(
    await verifyWebhookSignature(JSON.stringify({ amount: 100000 }), header),
    false,
  );
});

test("устаревшая подпись отклоняется", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;

  assert.equal(await verifyWebhookSignature(payload, signPayload(payload, oldTimestamp)), false);
});

test("отсутствие заголовка подписи отклоняется", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;

  assert.equal(await verifyWebhookSignature("{}", null), false);
});

test("без настроенного секрета подпись не принимается", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const payload = "{}";
  const timestamp = Math.floor(Date.now() / 1000);

  assert.equal(await verifyWebhookSignature(payload, signPayload(payload, timestamp)), false);
});
