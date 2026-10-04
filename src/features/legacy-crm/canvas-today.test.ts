import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { DESIGN_THEME_CSS } from "./design-theme";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function block() {
  const start = html.indexOf("// ---------- ДИЗАЙН: СЕГОДНЯ");
  const end = html.indexOf("function renderCanvasTodayDashboard() {", start);
  assert.ok(start > 0 && end > start, "today helpers not found");
  return html.slice(start, end);
}

type Order = { id: string; status: string; createdAt?: string; payments?: Array<{ amount: number; date: string }>; revenue?: number; margin?: number; date?: string; installerIds?: string[]; clientId?: string; number?: string; installationAt?: string };

function load(orders: Order[], leads: Array<{ claimedAt?: string; receivedAt: string }> = []) {
  const context = vm.createContext({
    orderPayments: (o: Order) => o.payments || [],
    orderRevenue: (o: Order) => o.revenue || 0,
    orderMargin: (o: Order) => o.margin || 0,
    projectProfitDate: (o: Order) => new Date(`${o.date || "2026-10-04"}T12:00:00`),
    projectMonthlyFixedExpensePool: () => 7000,
    canonicalMessengerLeadRows: () => leads,
    getUser: (id: string) => ({ u1: { name: "Нурик Ахмедов" }, u2: { name: "Ринат" } } as Record<string, { name: string }>)[id],
    getClient: () => ({ name: "Ortiz Residence" }),
    T: (key: string) => key,
  });
  vm.runInContext(`${block()}; Object.assign(this, { todayInitials, todayWeekRevenue, todayOpenLeads, todayCrews, todayRevenueWeeks, todayMonthPlan, TODAY_CONTRACTED_STATUSES });`, context);
  return { crm: context as unknown as Record<string, (...args: unknown[]) => any> & { TODAY_CONTRACTED_STATUSES: string[] }, orders };
}

const NOW = new Date("2026-10-04T10:00:00");

test("the week's money is what was received, compared with the week before", () => {
  const { crm } = load([]);
  const orders = [
    { id: "a", status: "act_signed", payments: [{ amount: 2000, date: "2026-10-02" }, { amount: 500, date: "2026-09-25" }] },
    { id: "b", status: "payment_received", payments: [{ amount: 1000, date: "2026-09-27" }] },
  ];
  const week = crm.todayWeekRevenue(orders, NOW);
  assert.equal(week.current, 2000);
  assert.equal(week.previous, 1500);
  assert.equal(week.deltaPct, 33);
  assert.equal(crm.todayWeekRevenue([], NOW).deltaPct, null, "no previous week, no percentage");
});

test("leads without an answer: unclaimed website/Messenger leads plus new projects, oldest wait in hours", () => {
  const { crm } = load([], [{ receivedAt: "2026-10-04T07:00:00" }, { claimedAt: "2026-10-04T08:00:00", receivedAt: "2026-10-03T07:00:00" }]);
  const leads = crm.todayOpenLeads([{ id: "n", status: "new", createdAt: "2026-10-04T09:00:00" }, { id: "x", status: "proposal_sent" }], NOW);
  assert.deepEqual({ ...leads }, { count: 2, oldestHours: 3 });
});

test("crews now: installs in progress with their people and progress", () => {
  const { crm } = load([]);
  const crews = crm.todayCrews([{ id: "o", status: "installation_in_progress", installerIds: ["u1", "u2"], clientId: "c", installationAt: "2026-10-04T09:00:00" }, { id: "q", status: "proposal_sent" }]);
  assert.equal(crews.length, 1);
  assert.equal(crews[0].crew, "Нурик Ахмедов + Ринат");
  assert.equal(crews[0].initials, "НА");
  assert.equal(crews[0].progress, 100);
});

test("money to collect counts only agreed projects; the month plan is the break-even", () => {
  const { crm } = load([]);
  assert.ok(crm.TODAY_CONTRACTED_STATUSES.includes("act_signed"));
  assert.ok(!crm.TODAY_CONTRACTED_STATUSES.includes("proposal_sent"), "a proposal not yet accepted is not a debt");
  const plan = crm.todayMonthPlan([{ id: "a", status: "act_signed", revenue: 10000, margin: 4000 }, { id: "b", status: "new", revenue: 0 }], NOW);
  // fixed 7000 / margin 40% = 17 500 break-even; 10 000 is 57%
  assert.equal(Math.round(plan.breakEven), 17500);
  assert.equal(plan.pct, 57);
  assert.equal(plan.marginPct, 40);
  const weeks = crm.todayRevenueWeeks([{ id: "a", status: "act_signed", revenue: 10000, margin: 4000, date: "2026-10-02", payments: [] }], NOW);
  assert.equal(weeks[0].revenue, 10000);
  assert.equal(weeks[0].marginPct, 40);
  assert.equal(weeks.length, 5, "October has five week rows");
  assert.equal(weeks.filter((week: { future: boolean }) => week.future).length, 4, "weeks ahead are not drawn as zero");
});

test("the dashboard is the canvas «Сегодня» on desktop and phone", () => {
  assert.match(html, /return renderCanvasTodayDashboard\(\);/);
  for (const text of ["Бригады сейчас", "Лиды без ответа", "КП ждут", "Монтажей", "К сбору", "Выезды сегодня", "Требует действия", "Выручка и маржа", "План месяца"]) {
    assert.ok(html.includes(text), `missing ${text}`);
  }
  assert.match(DESIGN_THEME_CSS, /\.rp-today \{ max-width: 1600px; margin: 0 auto; display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
  assert.match(DESIGN_THEME_CSS, /html body \.rp-today \.rp-today-tiles\[data-rolanpro-mobile-action-row\] \{ display: grid !important; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important; \}/);
});
