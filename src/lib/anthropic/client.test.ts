import assert from "node:assert/strict";
import test from "node:test";

import {
  AnthropicRequestError,
  parseAnthropicRequest,
  resolveAnthropicModel,
} from "./client";

test("parseAnthropicRequest accepts bounded CRM chat input", () => {
  const request = parseAnthropicRequest({
    model: "claude-sonnet-4-6",
    max_tokens: 9000,
    system: "Rolan PRO CRM assistant",
    messages: [{ role: "user", content: "Покажи проекты без следующего действия" }],
  });

  assert.equal(request.model, "claude-sonnet-4-6");
  assert.equal(request.max_tokens, 2000);
  assert.equal(request.system, "Rolan PRO CRM assistant");
  assert.equal(request.messages.length, 1);
});

test("resolveAnthropicModel falls back instead of accepting arbitrary models", () => {
  assert.equal(resolveAnthropicModel("unknown-model"), "claude-haiku-4-5-20251001");
});

test("parseAnthropicRequest rejects invalid message roles", () => {
  assert.throws(
    () => parseAnthropicRequest({ messages: [{ role: "system", content: "unsafe" }] }),
    (error) => error instanceof AnthropicRequestError && error.code === "invalid_message_role",
  );
});
