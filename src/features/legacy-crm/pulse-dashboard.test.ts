import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
function harness(role = "owner") {
  const owner = { id: "owner", role };
  const orders = [
    { id: "a", managerId: "manager", paidAt: "2026-10-01T12:00:00", createdAt: "2026-10-01T12:00:00", status: "completed", revenue: 300 },
    { id: "b", managerId: "manager", paidAt: "2026-10-04T12:00:00", createdAt: "2026-10-04T12:00:00", status: "payment_received", revenue: 200 },
    { id: "c", managerId: "other", paidAt: "2026-10-04T13:00:00", createdAt: "2026-09-30T12:00:00", status: "new", revenue: 900 },
    { id: "d", managerId: "manager", paidAt: "2026-10-05T00:00:00", createdAt: "2026-10-05T00:00:00", status: "new", revenue: 500 },
    { id: "e", managerId: "manager", paidAt: "invalid", createdAt: "invalid", status: "new", revenue: 999 },
  ];
  const context = vm.createContext({ Date, Math, state: { lang: "ru" },
    currentUser: () => owner,
    visibleOrdersForUser: (user: { role: string }) => user.role === "owner" ? orders : orders.filter(o => o.managerId === "manager"),
    visibleClientsForUser: () => [], orderRevenue: (o: { revenue: number }) => o.revenue,
    academyEsc: (value: unknown) => String(value), fmtMoney: (n: number) => `$${n}`,
    navIconSvg: () => "<svg></svg>", renderPrecisionManagerDashboard: () => "operations",
    // A phone: the owner chose «Телефон — Пульс, компьютер — CRM 2.0» (2026-10-04).
    window: { matchMedia: () => ({ matches: true, addEventListener: () => undefined }) },
    render: () => undefined,
  });
  vm.runInContext(source.slice(source.indexOf("function pulsePeriodRange("), source.indexOf("// ---------- MANAGER: ORDERS ----------")), context);
  return context;
}

test("pulse periods use Monday weeks and exclude the next day's midnight", () => {
  const c = harness();
  c.now = new Date(2026, 9, 4, 15);
  const month = vm.runInContext("pulseBusinessSnapshot(currentUser(), 'month', now)", c);
  assert.equal(month.revenue, 1400);
  assert.equal(month.paid, 3);
  assert.equal(month.created, 2);
  assert.equal(month.bars.reduce((n: number, b: { value: number }) => n + b.value, 0), month.revenue);
  const day = vm.runInContext("pulseBusinessSnapshot(currentUser(), 'day', now)", c);
  assert.equal(day.revenue, 1100);
  assert.equal(day.bars.length, 1);
  const week = vm.runInContext("pulsePeriodRange('week', now)", c);
  assert.equal(week.start.getDay(), 1);
  assert.equal(week.start.getDate(), 28);
});

test("manager chart and totals only aggregate the role-scoped projects", () => {
  const c = harness("manager");
  c.now = new Date(2026, 9, 4, 15);
  const data = vm.runInContext("pulseBusinessSnapshot(currentUser(), 'month', now)", c);
  assert.equal(data.revenue, 500);
  assert.equal(data.paid, 2);
  assert.equal(data.active, 3);
  const html = vm.runInContext("renderPulseBusinessDashboard()", c);
  assert.match(html, /По вашим проектам/);
  assert.doesNotMatch(html, /Прибыль|Маржа|Конверсия|18%/);
});

test("on the phone the owner home is «Пульс бизнеса» and retains the operating center", () => {
  const c = harness();
  const html = vm.runInContext("renderManagerDashboard()", c);
  assert.match(html, /Пульс бизнеса/);
  assert.match(html, /<details class="pulse-operations"/);
  assert.match(html, /operations/);
  assert.match(html, /state.pulsePeriod='week'/);
  assert.match(html, /selectAppView\('reports'\)/);
});
