import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { categorizeTransaction, rulePatternFor } from "./categories";
import { decryptBankSecret, encryptBankSecret } from "./crypto";
import { createPlaidClient, PlaidApiError, type PlaidClient } from "./plaid";

test("built-in rules sort the usual operations", () => {
  const ads = categorizeTransaction({ name: "GOOGLE *ADS1234567", merchant_name: "Google Ads", amount: 300 });
  assert.deepEqual(ads, { category_code: "ADVERTISING", review_status: "auto", rule_id: null });

  const payout = categorizeTransaction({ name: "STRIPE TRANSFER ST-X1Y2", amount: -4820.5 });
  assert.equal(payout.category_code, "STRIPE_PAYOUT");
  assert.equal(payout.review_status, "auto");

  const cardPayment = categorizeTransaction({ name: "CHASE CREDIT CRD AUTOPAY", amount: 1200, plaid_category: "LOAN_PAYMENTS", plaid_category_detail: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" });
  assert.equal(cardPayment.category_code, "TRANSFER", "paying the card is not an expense");

  const fuel = categorizeTransaction({ name: "CHEVRON 0091234 WESTLAKE", amount: 64.1 });
  assert.equal(fuel.category_code, "FUEL");

  const alibaba = categorizeTransaction({ name: "ALIBABA.COM", amount: 2400 });
  assert.deepEqual([alibaba.category_code, alibaba.review_status], ["FILM_PURCHASE", "needs_review"], "a suggestion the owner confirms");
});

test("unknown operations wait in «Разобрать»; the owner's remembered rule wins", () => {
  const unknown = categorizeTransaction({ name: "ACME SIGNS LLC", amount: 180 });
  assert.deepEqual([unknown.category_code, unknown.review_status], ["OTHER_EXPENSE", "needs_review"]);
  const income = categorizeTransaction({ name: "ZELLE FROM JOHN SMITH", amount: -950 });
  assert.equal(income.category_code, "OTHER_INCOME");

  const rules = [{ rule_id: "r1", pattern: "acme signs llc", category_code: "MATERIALS" }];
  assert.deepEqual(categorizeTransaction({ name: "ACME SIGNS LLC", amount: 180 }, rules), { category_code: "MATERIALS", review_status: "auto", rule_id: "r1" });
  // A remembered rule even overrides a built-in keyword.
  const override = [{ rule_id: "r2", pattern: "chevron", category_code: "VEHICLE" }];
  assert.equal(categorizeTransaction({ name: "CHEVRON 0091234", amount: 50 }, override).category_code, "VEHICLE");
});

test("a remembered pattern drops card digits, dates and reference numbers", () => {
  assert.equal(rulePatternFor({ name: "ACME SIGNS LLC #4521 09/28" }), "acme signs llc");
  assert.equal(rulePatternFor({ name: "x", merchant_name: "Home Depot" }), "home depot");
});

test("bank secrets are encrypted and cannot be read after tampering", () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-auth-secret-of-at-least-thirty-two-characters";
  try {
    const sealed = encryptBankSecret("access-sandbox-1234");
    assert.ok(!sealed.includes("access-sandbox-1234"));
    assert.equal(decryptBankSecret(sealed), "access-sandbox-1234");
    const [version, iv, tag, body] = sealed.split(".");
    const tampered = [version, iv, tag, body.slice(0, -2) + (body.endsWith("A") ? "BB" : "AA")].join(".");
    assert.throws(() => decryptBankSecret(tampered));
  } finally {
    process.env.AUTH_SECRET = previous;
  }
});

test("Plaid calls carry the keys, the API version and the right environment", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify({ link_token: "link-sandbox-1", expiration: "x" }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = createPlaidClient({ clientId: "cid", secret: "sec", environment: "sandbox" }, fakeFetch);
  await client.createLinkToken({ userId: "u1" });
  assert.equal(calls[0].url, "https://sandbox.plaid.com/link/token/create");
  assert.equal(calls[0].headers["Plaid-Version"], "2020-09-14");
  assert.equal(calls[0].body.client_id, "cid");
  assert.deepEqual(calls[0].body.products, ["transactions"]);
  assert.deepEqual(calls[0].body.user, { client_user_id: "u1" });

  await client.createLinkToken({ userId: "u1", accessToken: "access-1" });
  assert.equal(calls[1].body.access_token, "access-1", "update mode for a re-login");
  assert.equal(calls[1].body.products, undefined);

  const failing = createPlaidClient({ clientId: "c", secret: "s", environment: "production" }, (async () =>
    new Response(JSON.stringify({ error_code: "ITEM_LOGIN_REQUIRED", error_message: "login" }), { status: 400 })) as unknown as typeof fetch);
  await assert.rejects(() => failing.getAccounts("a"), (error: unknown) => error instanceof PlaidApiError && error.code === "ITEM_LOGIN_REQUIRED");
});

test("transactions sync reads every page and restarts after a mid-pagination change", async () => {
  const { collectTransactionChanges } = await import("./service");
  const tx = (id: string) => ({ transaction_id: id, account_id: "a", amount: 1, date: "2026-10-01", name: id, pending: false });
  let calls = 0;
  const pages = [
    { added: [tx("t1")], modified: [], removed: [], next_cursor: "c1", has_more: true },
    "MUTATION",
    { added: [tx("t1")], modified: [], removed: [], next_cursor: "c1", has_more: true },
    { added: [tx("t2")], modified: [tx("t0")], removed: [{ transaction_id: "gone" }], next_cursor: "c2", has_more: false },
  ];
  const client = {
    syncTransactions: async () => {
      const page = pages[calls++];
      if (page === "MUTATION") throw new PlaidApiError("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", "retry");
      return page;
    },
  } as unknown as PlaidClient;
  const result = await collectTransactionChanges(client, "access", null);
  assert.deepEqual(result.added.map((item) => item.transaction_id), ["t1", "t2"], "the restarted run does not duplicate t1");
  assert.deepEqual(result.modified.map((item) => item.transaction_id), ["t0"]);
  assert.deepEqual(result.removed, ["gone"]);
  assert.equal(result.cursor, "c2");
});

test("bank feeds are owner-only and reachable from «Деньги»", () => {
  const routes = ["settings", "link-token", "connections", "sync", "overview", "transactions/[transactionId]"];
  for (const route of routes) {
    assert.match(readFileSync(`app/api/v1/finance/bank/${route}/route.ts`, "utf8"), /const auth = await requireBankOwner\(request\);/, route);
  }
  assert.match(readFileSync("src/features/bank/route-auth.ts", "utf8"), /requireRequestSession\(request, \[ROLE_CODES\.OWNER\]\)/);
  assert.match(readFileSync("app/legacy-crm/bank/page.tsx", "utf8"), /if \(session\.preview \|\| !session\.roles\.includes\(ROLE_CODES\.OWNER\)\) redirect\("\/legacy-crm"\);/);
  const legacyRoute = readFileSync("app/legacy-crm/route.ts", "utf8");
  assert.match(legacyRoute, /src="\/legacy-crm\/bank\?embed=1"/);
  assert.match(legacyRoute, /window\.renderAccounting = function renderAccountingWithBank\(\)/);
  // Keys never travel back to the browser.
  const service = readFileSync("src/features/bank/service.ts", "utf8");
  assert.match(service, /clientIdHint: settings \? `…\$\{settings\.client_id\.slice\(-4\)\}` : null/);
  assert.doesNotMatch(service, /secret: settings\.secret/);
});

test("Plaid errors reach the owner in plain Russian", async () => {
  const { bankError } = await import("./route-auth");
  const response = bankError(new PlaidApiError("INVALID_API_KEYS", "invalid client_id or secret provided"));
  const payload = (await response.json()) as { errors: Array<{ message: string }>; meta: { plaid_error_code: string } };
  assert.match(payload.errors[0].message, /Plaid не принял ключи/);
  assert.equal(payload.meta.plaid_error_code, "INVALID_API_KEYS");
  const relogin = (await bankError(new PlaidApiError("ITEM_LOGIN_REQUIRED", "login")).json()) as { errors: Array<{ message: string }> };
  assert.match(relogin.errors[0].message, /войти заново/);
});
