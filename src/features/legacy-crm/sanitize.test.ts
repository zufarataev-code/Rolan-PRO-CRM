import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeLegacyPayload, validateLegacyPayload } from "./sanitize";

test("validates the minimum legacy CRM shape", () => {
  assert.equal(
    validateLegacyPayload({ users: [], clients: [], orders: [], settings: {} }),
    true,
  );
  assert.equal(validateLegacyPayload({ users: [], settings: {} }), false);
});

test("removes browser-visible credentials and employee pins", () => {
  const result = sanitizeLegacyPayload({
    users: [{ id: "owner", pin: "1234" }],
    clients: [],
    orders: [],
    settings: {
      telegramBotToken: "telegram-secret",
      stripe: { secretKey: "stripe-secret", publishableKey: "public" },
      integrations: {
        leadBackendKey: "backend-secret",
        ai: { apiKey: "ai-secret" },
      },
      sms: {
        twilio: { authToken: "twilio-secret", apiKeySecret: "key-secret" },
        textbelt: { apiKey: "sms-secret" },
      },
    },
  }) as Record<string, any>;

  assert.equal(result.users[0].pin, "");
  assert.equal(result.settings.telegramBotToken, "");
  assert.equal(result.settings.stripe.secretKey, "");
  assert.equal(result.settings.stripe.publishableKey, "public");
  assert.equal(result.settings.integrations.leadBackendKey, "");
  assert.equal(result.settings.integrations.ai.apiKey, "");
  assert.equal(result.settings.sms.twilio.authToken, "");
  assert.equal(result.settings.sms.twilio.apiKeySecret, "");
  assert.equal(result.settings.sms.textbelt.apiKey, "");
});
