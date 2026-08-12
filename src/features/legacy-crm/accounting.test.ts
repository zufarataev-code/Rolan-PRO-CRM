import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("accounting is an owner-only CRM module", () => {
  assert.match(
    html,
    /\.\.\.\(role === 'owner' \? \[\['accounting', 'Учёт', '🧾'\]\] : \[\]\)/,
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
    /Касса изменится только после добавления фактической операции/,
  );
  assert.match(
    html,
    /financeAllRows\(\)[\s\S]*financeManualRows\(\), \.\.\.financeSystemRows\(\)/,
  );
  assert.doesNotMatch(html, /source: 'opex'/);
});

test("legacy tracker import is limited to financial records", () => {
  assert.match(html, /Array\.isArray\(payload\.accounts\)/);
  assert.match(html, /Array\.isArray\(payload\.txns\)/);
  assert.match(html, /payload\.subs/);
  assert.doesNotMatch(html, /payload\.clients/);
  assert.doesNotMatch(html, /payload\.projects/);
});
