import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

type Order = Record<string, unknown> & { id: string; status: string; rev: number; mar: number; net?: number; debt?: number };
type Home = {
  crm2HomeRange: (period: string, now: Date) => { from: Date; to: Date; prevFrom: Date; prevTo: Date; compare: string };
  crm2HomeSales: (orders: Order[], from: Date, to: Date, withProfit?: boolean) => { count: number; revenue: number; netProfit: number; average: number };
  crm2HomeDebts: (orders: Order[], now: Date) => { total: number; count: number; overdueCount: number; overdueTotal: number };
  crm2HomeGoal: (orders: Order[], now: Date) => { goal: number; earned: number; pct: number; perMonth: number; monthsLeft: number };
  crm2HomeFunnel: (orders: Order[], from: Date, to: Date) => Array<[string, number, string]>;
  crm2HomeAttention: (orders: Order[], owner: boolean, now: Date) => Array<{ label: string; count: number; go: string }>;
  crm2HomeExpenses: (rows: unknown[], from: Date, to: Date) => { list: Array<[string, number]>; total: number };
  crm2OrderDirection: (order: Partial<Order>) => string;
  crm2Plural: (count: number, forms: string[]) => string;
  crm2Pct: (part: number, whole: number) => string;
  renderCrm2Home: () => string;
};

function loadHome(role: string, orders: Order[], settings: Record<string, unknown> = {}) {
  const start = html.indexOf("// ---------- CRM 2.0: ГЛАВНАЯ — ТОЛЬКО ЦИФРЫ");
  const end = html.indexOf("// ---------- MANAGER: ORDERS ----------", start);
  assert.ok(start > 0 && end > start);
  const state: Record<string, unknown> = { homePeriod: "month" };
  const context = vm.createContext({
    state,
    db: { settings, orders },
    window: {},
    currentUser: () => ({ id: "u1", role }),
    visibleOrdersForUser: () => orders,
    orderRevenue: (o: Order) => o.rev,
    orderMargin: (o: Order) => o.mar,
    orderDebt: (o: Order) => o.debt || 0,
    projectProfitability: (o: Order) => ({ netProfit: o.net ?? 0 }),
    projectProfitDate: (o: Order) => new Date(String(o.installationDoneAt || o.installationAt || o.proposalAcceptedAt || o.createdAt)),
    projectMonthAdBudget: () => 9000,
    financeData: () => ({ accounts: [{ id: "chase" }, { id: "fin_unallocated" }, { id: "old", active: false }] }),
    financeAccountBalance: (id: string) => ({ chase: 48040, fin_unallocated: 999, old: 5 } as Record<string, number>)[id] || 0,
    financeAllRows: () => [],
    financeDate: (value: string) => new Date(value),
    financeStockValue: () => 21600,
    warehouseNeedItems: () => [{ name: "Керамика 60″" }],
    canonicalMessengerLeadRows: () => [],
    orderActualAreaSqft: () => 0,
    orderPlannedAreaSqft: () => 0,
    FINANCE_CATEGORY_OPTIONS: [["marketing", "Реклама"], ["payroll", "Выплата зарплаты"], ["owner_draw", "Личное изъятие владельца"]],
    fmtMoney: (n: number) => `$${Math.round(n)}`,
    academyEsc: (value: string) => String(value),
    crm2Go: () => undefined,
  });
  vm.runInContext(
    `${html.slice(start, end)}; Object.assign(this, { crm2HomeRange, crm2HomeSales, crm2HomeDebts, crm2HomeGoal, crm2HomeFunnel, crm2HomeAttention, crm2HomeExpenses, crm2OrderDirection, crm2Plural, crm2Pct, renderCrm2Home });`,
    context,
  );
  return context as unknown as Home;
}

const NOW = new Date(2026, 9, 14, 12);
const at = (month: number, day: number) => new Date(2026, month, day, 10).toISOString();

const ORDERS: Order[] = [
  { id: "a", status: "payment_received", serviceType: "smart_film", rev: 9800, mar: 4700, net: 2600, installationDoneAt: at(9, 3), createdAt: at(8, 20), measurementDoneAt: at(9, 1), proposalSentAt: at(9, 2), proposalAcceptedAt: at(9, 2) },
  { id: "b", status: "installation_done", serviceType: "solar_film", rev: 4200, mar: 1700, net: 900, debt: 4200, installationDoneAt: at(9, 2), createdAt: at(9, 1), proposalAcceptedAt: at(9, 1) },
  { id: "c", status: "act_signed", serviceType: "protective_film", rev: 3000, mar: 1200, net: 500, debt: 1000, installationDoneAt: at(8, 10), createdAt: at(8, 1), actSignedAt: at(8, 11) },
  { id: "d", status: "proposal_sent", serviceType: "solar_film", rev: 3348, mar: 1300, createdAt: at(9, 5), proposalSentAt: at(9, 8) },
  { id: "e", status: "measurement_done", serviceType: "protective_film", rev: 4800, mar: 1900, createdAt: at(9, 9), measurementDoneAt: at(9, 10) },
  { id: "f", status: "new", serviceType: "smart_film", rev: 0, mar: 0, createdAt: new Date(2026, 9, 14, 11, 30).toISOString() },
  { id: "g", status: "proposal_accepted", serviceType: "decorative_film", rev: 2400, mar: 1050, net: 400, createdAt: at(9, 6), proposalAcceptedAt: at(9, 12) },
];

test("periods: calendar month against the previous month, weeks start on Monday", () => {
  const home = loadHome("owner", ORDERS);
  const month = home.crm2HomeRange("month", NOW);
  assert.equal(month.from.getTime(), new Date(2026, 9, 1).getTime());
  assert.equal(month.to.getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(month.prevFrom.getTime(), new Date(2026, 8, 1).getTime());
  assert.equal(month.compare, "с сентябрём");
  const week = home.crm2HomeRange("week", NOW);
  assert.equal(week.from.getDay(), 1, "Monday");
  assert.equal(week.from.getDate(), 12);
  assert.equal(home.crm2HomeRange("quarter", NOW).from.getMonth(), 9);
  assert.equal(home.crm2HomeRange("year", NOW).compare, "с 2025 годом");
});

test("revenue and net profit count only agreed projects dated in the period", () => {
  const home = loadHome("owner", ORDERS);
  const { from, to, prevFrom, prevTo } = home.crm2HomeRange("month", NOW);
  const october = home.crm2HomeSales(ORDERS, from, to, true);
  assert.equal(october.count, 3, "a, b, g — not the proposal or the measurement");
  assert.equal(october.revenue, 9800 + 4200 + 2400);
  assert.equal(october.netProfit, 2600 + 900 + 400);
  assert.equal(october.average, (9800 + 4200 + 2400) / 3);
  assert.equal(home.crm2HomeSales(ORDERS, prevFrom, prevTo, true).revenue, 3000);
  assert.equal(home.crm2HomeSales(ORDERS, from, to, false).netProfit, 0, "no profit without the owner");
});

test("clients owe: agreed projects only; overdue when the work was done more than a week ago", () => {
  const home = loadHome("owner", ORDERS);
  const debts = home.crm2HomeDebts(ORDERS, NOW);
  assert.equal(debts.total, 5200);
  assert.equal(debts.count, 2);
  assert.equal(debts.overdueCount, 2, "b was done on 2 Oct, c in September");
  assert.equal(home.crm2HomeDebts(ORDERS, new Date(2026, 9, 5)).overdueCount, 1);
});

test("the year goal is $50 000 unless the owner set another, and shows what each month needs", () => {
  const goal = loadHome("owner", ORDERS).crm2HomeGoal(ORDERS, NOW);
  assert.equal(goal.goal, 50000);
  assert.equal(goal.earned, 2600 + 900 + 500 + 400);
  assert.equal(goal.monthsLeft, 3);
  assert.equal(Math.round(goal.perMonth), Math.round((50000 - 4400) / 3));
  assert.equal(loadHome("owner", ORDERS, { yearProfitGoal: 80000 }).crm2HomeGoal(ORDERS, NOW).goal, 80000);
});

test("funnel counts what happened in the period; a rate above 100% is not shown", () => {
  const home = loadHome("owner", ORDERS);
  const { from, to } = home.crm2HomeRange("month", NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(home.crm2HomeFunnel(ORDERS, from, to).map(([label, value]) => [label, value]))), [
    ["Лиды", 5], ["Замеры", 2], ["КП", 2], ["Сделки", 3],
  ]);
  assert.equal(home.crm2Pct(2, 5), "40%");
  assert.equal(home.crm2Pct(3, 2), "");
});

test("«Требует внимания» is counters only, each opening its list", () => {
  const home = loadHome("owner", ORDERS);
  const alerts = Object.fromEntries(home.crm2HomeAttention(ORDERS, true, NOW).map((alert) => [alert.label, alert]));
  assert.equal(alerts["Лиды без ответа > 1 часа"].count, 0, "f came in less than an hour ago");
  assert.equal(home.crm2HomeAttention(ORDERS, true, new Date(2026, 9, 14, 13)).find((a) => a.label.startsWith("Лиды"))?.count, 1);
  assert.equal(alerts["Замер без КП"].count, 1);
  assert.equal(alerts["Замер без КП"].go, "crm2HomeOpenStatus('measurement_done')");
  assert.equal(alerts["КП без ответа 3+ дня"].count, 1);
  assert.equal(alerts["Принято, нет даты монтажа"].count, 1);
  assert.equal(alerts["Сделано, нет акта"].count, 1);
  assert.equal(alerts["Просрочены оплаты"].go, "crm2Go('paymentsdue')");
  assert.equal(home.crm2HomeAttention(ORDERS, false, NOW).find((a) => a.label === "Просрочены оплаты")?.go, "crm2Go('orders')");
  assert.equal(alerts["Заканчивается на складе"].count, 1);
});

test("expenses group by category and leave out the owner's personal money", () => {
  const home = loadHome("owner", ORDERS);
  const rows = [
    { type: "expense", category: "marketing", amount: 5870, date: at(9, 3) },
    { type: "expense", category: "payroll", amount: 1100, date: at(9, 4) },
    { type: "expense", category: "owner_draw", amount: 3000, date: at(9, 4) },
    { type: "expense", category: "payroll", amount: 900, date: at(9, 5), scope: "personal" },
    { type: "income", category: "client_payment", amount: 9000, date: at(9, 5) },
    { type: "expense", category: "marketing", amount: 400, date: at(8, 28) },
  ];
  const { from, to } = home.crm2HomeRange("month", NOW);
  const expenses = home.crm2HomeExpenses(rows, from, to);
  assert.equal(expenses.total, 6970);
  assert.deepEqual(JSON.parse(JSON.stringify(expenses.list)), [["Реклама", 5870], ["Выплата зарплаты", 1100]]);
});

test("the owner sees the company's money; a manager sees sales, works and attention only", () => {
  const owner = loadHome("owner", ORDERS).renderCrm2Home();
  for (const block of ["Чистая прибыль", "Деньги на счетах", "Цель 2026", "Реклама", "Расходы", "Требует внимания"]) assert.match(owner, new RegExp(block));
  assert.match(owner, /\$48040/, "money on active accounts, not the unallocated bucket");
  const manager = loadHome("manager", ORDERS).renderCrm2Home();
  for (const hidden of ["Чистая прибыль", "Деньги на счетах", "Цель 2026", "Реклама", "Расходы", "Изменить цель"]) assert.doesNotMatch(manager, new RegExp(hidden));
  for (const shown of ["Выручка", "Сделки", "Средний чек", "Клиенты должны", "Воронка", "Работы", "Требует внимания"]) assert.match(manager, new RegExp(shown));
  assert.doesNotMatch(manager, /class="crm2-funnel-row"[\s\S]*?·\s*\d+%<\/span>[\s\S]*?По направлениям/, "no margin by direction for managers");
});

test("the home screen has no order lists and replaces the old dashboard", () => {
  const owner = loadHome("owner", ORDERS).renderCrm2Home();
  assert.doesNotMatch(owner, /Очередь действий|Монтажи в работе|openOrder\(/);
  assert.match(html, /function renderManagerDashboard\(\) \{\n {2}return renderCrm2Home\(\);\n\}/);
  const home = loadHome("owner", ORDERS);
  assert.equal(home.crm2OrderDirection({ serviceType: "smart_film" }), "smart_film");
  assert.equal(home.crm2OrderDirection({ serviceCategory: "Security / safety" }), "protective_film");
  assert.equal(home.crm2Plural(2, ["проект", "проекта", "проектов"]), "2 проекта");
  assert.equal(home.crm2Plural(11, ["проект", "проекта", "проектов"]), "11 проектов");
  assert.equal(home.crm2Plural(21, ["счёт", "счёта", "счетов"]), "21 счёт");
});
