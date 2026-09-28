import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyOperationsAgentSignature } from "@/lib/operations-agent/auth";

const secret = "test-operations-agent-secret-that-is-long-enough";
const body = JSON.stringify({ action: "find_client", arguments: { query: "Test" } });
const nowMs = Date.UTC(2026, 8, 26, 20, 0, 0);
const timestamp = String(Math.floor(nowMs / 1000));
const signature = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");

test("operations agent accepts a valid HMAC signature", () => {
  assert.equal(verifyOperationsAgentSignature(body, timestamp, signature, secret, nowMs), true);
});

test("operations agent rejects invalid signature", () => {
  assert.equal(verifyOperationsAgentSignature(body, timestamp, "00".repeat(32), secret, nowMs), false);
});

test("operations agent rejects expired timestamp", () => {
  const expired = String(Math.floor(nowMs / 1000) - 301);
  const expiredSignature = createHmac("sha256", secret).update(expired + "." + body).digest("hex");
  assert.equal(verifyOperationsAgentSignature(body, expired, expiredSignature, secret, nowMs), false);
});
