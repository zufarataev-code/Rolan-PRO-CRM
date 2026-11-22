import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Owner, 2026-11-22: a project entered after the fact needs a confirmed payment
// that lands on an account, so balances and profit are right.
const html = readFileSync(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");
const stages = readFileSync(join(process.cwd(), "private/legacy/production-stages.js"), "utf8");

function fn(src: string, name: string) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  // Skip default-argument braces: the body starts after the closing parenthesis.
  for (let i = src.indexOf(") {", start) + 2; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(name);
}

function financeRows(orders: any[]) {
  const code = fn(html, "financeSystemRows");
  const run = new Function(
    "db", "financeManualRows", "financeLinkedAmount", "ensureWarehouseReceipts", "getUser",
    `${code}; return financeSystemRows();`,
  );
  return run(
    { orders, inventory: [], payrollPayments: [] },
    () => [],
    () => 0,
    () => [],
    () => null,
  ) as any[];
}

test("a payment with an account goes to that account, the rest stays unallocated", () => {
  const rows = financeRows([{
    id: "o1", number: "R-1", paid: 1500, createdAt: "2026-10-01",
    payments: [
      { id: "p1", amount: 1000, date: "2026-10-05", accountId: "fin_business_checking", confirmed: true },
      { id: "p2", amount: 500, date: "2026-10-06" },
    ],
  }]).filter(r => r.category === "client_payment");
  assert.deepEqual(rows.map(r => [r.accountId, r.amount]).sort(), [["fin_business_checking", 1000], ["fin_unallocated", 500]]);
});

test("paid historical expenses reduce their account; planned ones do not touch cash", () => {
  const rows = financeRows([{
    id: "o2", number: "R-2", paid: 0, createdAt: "2026-10-01",
    extraExpenses: [
      { id: "e1", amount: 120, actual: true, paidAt: "2026-10-02", accountId: "fin_cash", label: "Бензин" },
      { id: "e2", amount: 80, projectDirect: true },
    ],
  }]).filter(r => r.category === "project_expense");
  assert.deepEqual(rows.map(r => [r.accountId, r.amount]), [["fin_cash", 120]]);
});

test("quick entry asks for confirmation and an account before closing with money", () => {
  const commit = fn(stages, "quickEntryCommit");
  assert.match(commit, /closeProject && paid > 0 && !f\.paidConfirmed/);
  assert.match(commit, /closeProject && paid > 0 && !f\.account/);
  assert.match(commit, /accountId: f\.account \|\| null, confirmed: !!f\.paidConfirmed/);
  assert.match(stages, /id="qe-paidConfirmed" type="checkbox"/);
  assert.match(stages, /id="qe-account"/);
  const close = fn(html, "closeQuickProjectAsCompletedWith");
  assert.match(close, /accountId: accountId \|\| null, confirmed: !!confirmed/);
});

test("ordinary payment modal records the account too", () => {
  assert.match(html, /financePaymentAccountSelect\('pay-account'\) : ''/);
  assert.match(fn(html, "addOrderPayment"), /accountId: data\.accountId \|\| null/);
  assert.match(fn(html, "confirmPayment"), /accountId: document\.getElementById\('pay-account'\)\?\.value \|\| null/);
});

test("draft expenses stay plan; closing marks them paid from the chosen account", () => {
  assert.doesNotMatch(fn(stages, "quickEntryCommit"), /actual: true, paidAt: firstDate/);
  const close = fn(html, "closeQuickProjectAsCompletedWith");
  assert.match(close, /if \(accountId && !e\.accountId\) e\.accountId = accountId;/);
  assert.match(close, /note: 'Оплата из старой CRM', accountId: accountId \|\| null/);
});

test("compact cards keep the urgency warning", () => {
  const card = fn(html, "renderOrderKanbanCard");
  const line = card.slice(card.indexOf('class="kanban-compact-line"'), card.indexOf('class="kanban-card-details'));
  assert.match(line, /urgency \? `<span class="kanban-chip \$\{urgency\.cls\}">/);
});
