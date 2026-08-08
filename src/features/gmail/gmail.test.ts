import assert from "node:assert/strict";
import test from "node:test";

import { decryptGmailToken, encryptGmailToken } from "@/features/gmail/crypto";
import { buildRawGmailMessage, encodeGmailHeader, gmailPartText, parseEmailAddresses } from "@/features/gmail/service";

test("Gmail OAuth tokens are encrypted and authenticated", () => {
  const previous = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const encrypted = encryptGmailToken("refresh-token-value");
    assert.notEqual(encrypted, "refresh-token-value");
    assert.equal(decryptGmailToken(encrypted), "refresh-token-value");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    assert.throws(() => decryptGmailToken(parts.join(".")));
  } finally {
    if (previous === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test("Gmail address parser normalizes mailbox headers", () => {
  assert.deepEqual(
    parseEmailAddresses('Zufar <INFO@ROLAN-PRO.COM>, client@example.com'),
    ["info@rolan-pro.com", "client@example.com"],
  );
});

test("Gmail MIME parser prefers the plain text part", () => {
  const plain = Buffer.from("Hello from ROLANPRO", "utf8").toString("base64url");
  const html = Buffer.from("<b>Fallback</b>", "utf8").toString("base64url");
  assert.equal(gmailPartText({
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: plain } },
      { mimeType: "text/html", body: { data: html } },
    ],
  }), "Hello from ROLANPRO");
});

test("Gmail raw message strips header injection and preserves body", () => {
  const raw = buildRawGmailMessage({
    from: "info@rolan-pro.com",
    to: "client@example.com\r\nBcc: attacker@example.com",
    subject: "Proposal\nInjected: no",
    body: "Order details",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /To: client@example\.com Bcc: attacker@example\.com/);
  assert.doesNotMatch(decoded, /\r\nBcc:/);
  assert.match(decoded, /\r\n\r\nOrder details$/);
});

test("Gmail subject uses RFC 2047 encoding for Cyrillic and symbols", () => {
  const encoded = encodeGmailHeader("Заказ R-42 — готов");
  assert.match(encoded, /^=\?UTF-8\?B\?/);
  const decodedWords = encoded.split(/\r\n /).map((word) => {
    const match = word.match(/^=\?UTF-8\?B\?(.+)\?=$/);
    assert.ok(match);
    return Buffer.from(match[1], "base64").toString("utf8");
  }).join("");
  assert.equal(decodedWords, "Заказ R-42 — готов");
});
