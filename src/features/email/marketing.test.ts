import assert from "node:assert/strict";
import test from "node:test";

import { marketingEmailConfig } from "@/features/email/marketing";

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("marketing email cannot use the primary Google Workspace mailbox", () => {
  const previous = {
    gmail: process.env.GMAIL_ALLOWED_ADDRESS,
    from: process.env.MARKETING_EMAIL_FROM,
    key: process.env.MARKETING_EMAIL_API_KEY,
  };
  try {
    process.env.GMAIL_ALLOWED_ADDRESS = "info@rolan-pro.com";
    process.env.MARKETING_EMAIL_FROM = "RolanPRO <info@rolan-pro.com>";
    process.env.MARKETING_EMAIL_API_KEY = "test-key";
    assert.throws(() => marketingEmailConfig(), /must not be the main Google Workspace mailbox/i);
  } finally {
    restore("GMAIL_ALLOWED_ADDRESS", previous.gmail);
    restore("MARKETING_EMAIL_FROM", previous.from);
    restore("MARKETING_EMAIL_API_KEY", previous.key);
  }
});

test("marketing email reports a separate configured sender", () => {
  const previous = {
    gmail: process.env.GMAIL_ALLOWED_ADDRESS,
    provider: process.env.MARKETING_EMAIL_PROVIDER,
    from: process.env.MARKETING_EMAIL_FROM,
    key: process.env.MARKETING_EMAIL_API_KEY,
    replyTo: process.env.MARKETING_EMAIL_REPLY_TO,
  };
  try {
    process.env.GMAIL_ALLOWED_ADDRESS = "info@rolan-pro.com";
    process.env.MARKETING_EMAIL_PROVIDER = "resend";
    process.env.MARKETING_EMAIL_FROM = "RolanPRO <hello@updates.rolan-pro.com>";
    process.env.MARKETING_EMAIL_API_KEY = "test-key";
    delete process.env.MARKETING_EMAIL_REPLY_TO;
    assert.deepEqual(marketingEmailConfig(), {
      configured: true,
      provider: "resend",
      from: "RolanPRO <hello@updates.rolan-pro.com>",
      replyTo: "info@rolan-pro.com",
    });
  } finally {
    restore("GMAIL_ALLOWED_ADDRESS", previous.gmail);
    restore("MARKETING_EMAIL_PROVIDER", previous.provider);
    restore("MARKETING_EMAIL_FROM", previous.from);
    restore("MARKETING_EMAIL_API_KEY", previous.key);
    restore("MARKETING_EMAIL_REPLY_TO", previous.replyTo);
  }
});
