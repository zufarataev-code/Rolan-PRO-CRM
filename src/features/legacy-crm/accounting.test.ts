import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);
const legacyRoute = readFileSync(join(process.cwd(), "app/legacy-crm/route.ts"), "utf8");

test("duplicate embedded Money Tracker is removed from the CRM shell", () => {
  assert.doesNotMatch(legacyRoute, /moneyTrackerPatch/);
  assert.doesNotMatch(legacyRoute, /openRolanProMoneyTracker/);
  assert.doesNotMatch(legacyRoute, /rolanpro-money-overlay/);
});

test("accounting is an owner-only CRM module", () => {
  assert.match(
    html,
    /\.\.\.\(role === 'owner' \? \[\['accounting', 'Деньги', '💵'\]\] : \[\]\)/,
  );
  assert.match(
    html,
    /case 'accounting': return u\.role === 'owner' \? renderAccounting\(\)/,
  );
  assert.match(
    html,
    /if \(currentUser\(\)\?\.role !== 'owner'\) return/,
  );
});

test("accounting reads operational data without cloning orders", () => {
  assert.match(html, /source: 'orders', sourceLabel: 'Заказы'/);
  assert.match(html, /source: 'inventory', sourceLabel: 'Склад'/);
  assert.match(html, /source: 'payroll', sourceLabel: 'Зарплата'/);
  assert.match(html, /const paid = Math\.max\(0, Number\(o\.paid\) \|\| 0\)/);
  assert.match(html, /\(db\.inventory \|\| \[\]\)\.forEach/);
  assert.doesNotMatch(html, /db\.finance\.orders\s*=/);
  assert.doesNotMatch(html, /db\.finance\.clients\s*=/);
});

test("planned expenses do not become cash movements automatically", () => {
  assert.match(
    html,
    /Остаток счёта изменится только после записи реальной оплаты/,
  );
  assert.match(
    html,
    /financeAllRows\(\)[\s\S]*financeManualRows\(\), \.\.\.financeSystemRows\(\)/,
  );
  assert.doesNotMatch(html, /source: 'opex'/);
  assert.match(html, /actualExpenses = \(o\.extraExpenses \|\| \[\]\)\.filter\(e => e\.actual === true \|\| e\.paid === true \|\| e\.paidAt\)/);
});

test("legacy tracker import is limited to financial records", () => {
  assert.match(html, /Array\.isArray\(payload\.accounts\)/);
  assert.match(html, /Array\.isArray\(payload\.txns\)/);
  assert.match(html, /payload\.subs/);
  assert.doesNotMatch(html, /payload\.clients/);
  assert.doesNotMatch(html, /payload\.projects/);
});

test("finance center keeps accounts, categories, tags and expense dimensions", () => {
  assert.match(html, /FINANCE_CATEGORY_OPTIONS/);
  assert.match(html, /id="fin-account-institution"/);
  assert.match(html, /id="fin-account-last4"/);
  assert.match(html, /id="fin-scope"/);
  assert.match(html, /id="fin-behavior"/);
  assert.match(html, /id="fin-tags"/);
  assert.match(html, /function financeFilteredRows\(rows\)/);
});

test("system money is allocated to an account instead of duplicated", () => {
  assert.match(html, /function financeOpenAllocationModal\(rowId\)/);
  assert.match(html, /function financeSaveAllocation\(rowId\)/);
  assert.match(html, /inventoryId: row\.inventoryId \|\| null/);
  assert.match(html, /Источник останется один/);
});
