import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner, 2026-10-24: «ключ от Stripe в CRM… снять зависимость от Stripe».
// The key is entered in CRM settings, goes straight to the server encrypted,
// never comes back to the browser; Stripe stays optional.

test("only secret or restricted keys are accepted; the browser sees a hint", async () => {
  const { STRIPE_KEY_PATTERN, stripeKeyHint } = await import("./stripe-settings");
  assert.ok(STRIPE_KEY_PATTERN.test("sk_live_" + "a".repeat(24)));
  assert.ok(STRIPE_KEY_PATTERN.test("rk_test_" + "B1".repeat(12)));
  assert.ok(!STRIPE_KEY_PATTERN.test("pk_live_" + "a".repeat(24)), "a publishable key is not a secret");
  assert.ok(!STRIPE_KEY_PATTERN.test("sk_live_short"));
  assert.equal(stripeKeyHint("sk_live_abcdefghijklmnop1234"), "sk_…1234");
});

test("the server reads the key from env first, then the encrypted CRM setting", () => {
  const source = readFileSync("src/features/payments/stripe-settings.ts", "utf8");
  assert.match(source, /const fromEnv = process\.env\.STRIPE_SECRET_KEY\?\.trim\(\);\n  if \(fromEnv\) return fromEnv;/);
  assert.match(source, /decryptBankSecret\(row\.secret_encrypted\)/);
  const checkout = readFileSync("src/features/payments/stripe-checkout.ts", "utf8");
  assert.match(checkout, /const secretKey = await getStripeSecretKey\(\);/);
  assert.doesNotMatch(checkout, /process\.env\.STRIPE_SECRET_KEY/);
  const route = readFileSync("app/api/v1/settings/stripe/route.ts", "utf8");
  assert.match(route, /export async function PUT[\s\S]*?\[ROLE_CODES\.OWNER\]\)/, "only the owner saves the key");
  assert.doesNotMatch(route, /secret_encrypted|getStripeSecretKey/, "the route never returns the key");
  const migration = readFileSync("prisma/migrations/20261024120000_stripe_settings/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "stripe_settings"/);
});

test("the browser never holds the key or calls Stripe itself", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.doesNotMatch(html, /api\.stripe\.com/);
  assert.doesNotMatch(html, /db\.settings\.stripe\.secretKey\s*=/);
  assert.match(html, /if \(s\.stripe && s\.stripe\.secretKey\) delete s\.stripe\.secretKey;/);
  assert.match(html, /stripeServerApi\('', \{ method: 'PUT', body: JSON\.stringify\(\{ secret_key: value \}\) \}\)/);
  assert.match(html, /return !!stripeServerStatus\?\.configured;/);
  assert.match(html, /CRM работает и без Stripe/);
  const sanitize = readFileSync("src/features/legacy-crm/sanitize.ts", "utf8");
  assert.match(sanitize, /clear\(stripe, "secretKey"\);/);
});
