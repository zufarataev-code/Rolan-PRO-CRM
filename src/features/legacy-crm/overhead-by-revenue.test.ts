import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function slice(startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `${startMarker} not found`);
  return html.slice(start, end);
}

type Order = { id: string; revenue: number; date: string; margin?: number };

function load(orders: Order[], fixedPool = 10120) {
  const db = { orders, settings: { pricingDefaults: { marketingPct: 10 } } };
  const context = vm.createContext({
    db,
    queueMicrotask,
    orderRevenue: (o: Order) => o.revenue,
    projectProfitDate: (o: Order) => new Date(`${o.date}T12:00:00`),
    projectProfitMonthOrders: (o: Order) => orders.filter((x) => x.revenue > 0 && x.date.slice(0, 7) === o.date.slice(0, 7)),
    projectMonthlyFixedExpensePool: () => fixedPool,
    orderMargin: (o: Order) => o.margin ?? o.revenue * 0.5,
    projectProfitTaxProfile: () => ({ ratePct: 8.84, annualMinimum: 800 }),
  });
  const profitability = html.match(/function projectProfitability\(o\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(profitability);
  vm.runInContext(`${slice("// ---------- НАКЛАДНЫЕ ПО ВЫРУЧКЕ", "function orderPSS(o) {")}\n${profitability}\nObject.assign(this, { projectMonthAdBudget, projectRevenueShare, orderAdAllocation, projectProfitability, resetCache: () => { projectMonthRevenueCache = null; } });`, context);
  return context as unknown as {
    projectMonthAdBudget: (d: Date) => { budget: number; basis: string; baseRevenue: number; pct: number };
    projectRevenueShare: (o: Order) => number;
    orderAdAllocation: (o: Order) => number;
    projectProfitability: (o: Order) => { fixedAllocation: number; adAllocation: number; revenueShare: number; monthRevenue: number; profitBeforeTax: number; adBudget: { budget: number } };
    resetCache: () => void;
  };
}

const SEPTEMBER = [{ id: "a", revenue: 60000, date: "2026-09-10" }, { id: "b", revenue: 40000, date: "2026-09-20" }];
const OCTOBER = [{ id: "c", revenue: 20000, date: "2026-10-05" }, { id: "d", revenue: 50000, date: "2026-10-15" }];

test("the month's ad budget is 10% of the previous month's revenue", () => {
  const crm = load([...SEPTEMBER, ...OCTOBER]);
  const october = crm.projectMonthAdBudget(new Date("2026-10-15T12:00:00"));
  assert.equal(october.budget, 10000, "$100 000 in September → $10 000 for October");
  assert.equal(october.basis, "previous");
  assert.equal(october.baseRevenue, 100000);

  // No revenue in August: September is estimated from its own revenue.
  const september = crm.projectMonthAdBudget(new Date("2026-09-15T12:00:00"));
  assert.deepEqual([september.budget, september.basis], [10000, "current"]);
});

test("fixed costs and the ad budget are shared by revenue, not equally", () => {
  const crm = load([...SEPTEMBER, ...OCTOBER]);
  const small = crm.projectProfitability(OCTOBER[0]);
  const large = crm.projectProfitability(OCTOBER[1]);
  assert.equal(small.revenueShare.toFixed(4), (2 / 7).toFixed(4));
  assert.equal(small.fixedAllocation.toFixed(2), (10120 * 2 / 7).toFixed(2));
  assert.equal(large.fixedAllocation.toFixed(2), (10120 * 5 / 7).toFixed(2));
  assert.equal(small.adAllocation.toFixed(2), (10000 * 2 / 7).toFixed(2));
  assert.equal((small.fixedAllocation + large.fixedAllocation).toFixed(2), "10120.00", "the month's fixed costs are fully covered");
  assert.equal((small.adAllocation + large.adAllocation).toFixed(2), "10000.00", "the month's ad budget is fully covered");
  assert.equal(small.monthRevenue, 70000);
});

test("a project without a price carries no overhead; a draft outside the list is counted in its month", () => {
  const unpriced = { id: "e", revenue: 0, date: "2026-10-20" };
  const crm = load([...SEPTEMBER, ...OCTOBER, unpriced]);
  assert.equal(crm.projectProfitability(unpriced).fixedAllocation, 0);
  assert.equal(crm.orderAdAllocation(unpriced), 0);
  const draft = { id: "draft", revenue: 10000, date: "2026-10-25" };
  assert.equal(crm.projectRevenueShare(draft), 10000 / 80000);
});

test("revenue totals are recounted after a change", async () => {
  const orders = [...SEPTEMBER.map((o) => ({ ...o })), ...OCTOBER.map((o) => ({ ...o }))];
  const crm = load(orders);
  assert.equal(crm.projectMonthAdBudget(new Date("2026-10-15T12:00:00")).budget, 10000);
  orders[0].revenue = 80000;
  await Promise.resolve();
  assert.equal(crm.projectMonthAdBudget(new Date("2026-10-15T12:00:00")).budget, 12000, "cleared after the current task");
  orders[1].revenue = 60000;
  crm.resetCache();
  assert.equal(crm.projectMonthAdBudget(new Date("2026-10-15T12:00:00")).budget, 14000, "cleared on save");
  assert.match(html, /function save\(\) \{\n[^\n]*ensureAutoDraftPurchaseRequests\(\);\n {2}projectMonthRevenueCache = null;/);
});

test("the owner sees the ad budget rule in the project and in the company cost model", () => {
  assert.match(html, /Постоянные расходы и реклама делятся между проектами месяца по выручке/);
  assert.match(html, /<span>Бюджет рекламы месяца<\/span>/);
  assert.match(html, /\$\{companyAdBudgetHint\(\)\}/);
  assert.match(html, /\['Реклама \(доля бюджета месяца\)', p\.marketing\]/);
});
