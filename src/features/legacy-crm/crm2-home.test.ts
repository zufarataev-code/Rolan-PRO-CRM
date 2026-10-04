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
  crm2HomeFunnel: (orders: Order[], from: Date, to: Date, now?: Date) => Array<[string, number, string]>;
  crm2HomeAttention: (orders: Order[], owner: boolean, now: Date) => Array<{ label: string; count: number; go: string }>;
  crm2HomeExpenses: (rows: unknown[], from: Date, to: Date) => { list: Array<[string, number]>; total: number };
  crm2HomeAds: (rows: unknown[], from: Date, to: Date, funnel: Array<[string, number, string]>, now: Date) => { budget: number; pct: number; estimate: boolean; spent: number; perLead: number | null };
  crm2HomeDirections: (deals: Order[]) => Array<{ id: string; revenue: number; marginPct: number | null }>;
  crm2HomeWorks: (orders: Order[], from: Date, to: Date, now?: Date) => { done: number; ahead: number; pending: number; sqft: number };
  crm2HomeOpenStatus: (status: string) => void;
  crm2HomeOpenOverdue: () => void;
  crm2OrderDirection: (order: Partial<Order>) => string;
  crm2Plural: (count: number, forms: string[]) => string;
  crm2Pct: (part: number, whole: number) => string;
  renderCrm2Home: () => string;
};

function loadHome(role: string, orders: Order[], settings: Record<string, unknown> = {}, leads: unknown[] = [], allLeads?: unknown[]) {
  const start = html.indexOf("// ---------- CRM 2.0: ГЛАВНАЯ — ТОЛЬКО ЦИФРЫ");
  const end = html.indexOf("// ---------- MANAGER: ORDERS ----------", start);
  assert.ok(start > 0 && end > start);
  const state: Record<string, unknown> = { homePeriod: "month", search: "Ortiz", managerFilter: "u2", dateFrom: "2026-01-01", dateTo: "2026-02-01", ordersPeriod: "week" };
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
    projectMonthlyFixedExpensePool: () => 1000,
    orderAdAllocation: (o: Order) => Number(o.ad) || 0,
    projectProfitTaxProfile: () => ({ ratePct: 10, annualMinimum: 1200 }),
    projectProfitDate: (o: Order) => new Date(String(o.installationDoneAt || o.installationAt || o.proposalAcceptedAt || o.createdAt)),
    projectMonthAdBudget: (date: Date) => ({ budget: (settings.adBudgetByMonth as Record<number, number> | undefined)?.[date.getMonth()] ?? (settings.adBudgetByMonth ? 0 : 9000), pct: 10, basis: "previous" }),
    financeData: () => ({ accounts: [{ id: "chase" }, { id: "fin_unallocated" }, { id: "old", active: false }] }),
    financeAccountBalance: (id: string) => ({ chase: 48040, fin_unallocated: 999, old: 5 } as Record<string, number>)[id] || 0,
    financeAllRows: () => [],
    financeDate: (value: string) => new Date(value),
    financeStockValue: () => 21600,
    warehouseNeedItems: () => [{ name: "Керамика 60″" }],
    canonicalMessengerLeadRows: () => leads,
    ...(allLeads ? { canonicalLeads: allLeads } : {}),
    windowRetailPrice: (win: { price: number }) => win.price,
    measureAllWindows: (o: Order) => ((o.measurements as { rooms?: Array<{ windows?: unknown[] }> } | undefined)?.rooms || []).flatMap((room) => room.windows || []),
    serviceOffering: (id: string) => (id === "decor-frost" ? { direction: "decorative" } : null),
    orderActualAreaSqft: () => 0,
    orderPlannedAreaSqft: () => 0,
    FINANCE_CATEGORY_OPTIONS: [["marketing", "Реклама"], ["payroll", "Выплата зарплаты"], ["owner_draw", "Личное изъятие владельца"]],
    fmtMoney: (n: number) => `$${Math.round(n)}`,
    academyEsc: (value: string) => String(value),
    crm2Go: () => { state.opened = `orders:${state.statusFilter}:${state.ordersOverdueOnly}`; },
    projectQuickSqft: (o: Order) => Number(o.quickSqft) || 0,
    projectServiceGroups: (o: Order) => ((o.services as Array<{ at: string; sqft: number; lines?: unknown[] }> | undefined) || []).map((service, index) => ({ id: `g${index}`, windows: service.sqft ? [{ sqft: service.sqft }] : [], lines: service.lines || [], at: service.at })),
    projectServiceAssignment: (_o: Order, group: { at: string }) => ({ installationAt: group.at }),
    windowActualAreaSqft: (win: { sqft: number }) => win.sqft,
    windowAreaSqft: () => 0,
  });
  vm.runInContext(
    `${html.slice(start, end)}; Object.assign(this, { crm2HomeRange, crm2HomeSales, crm2HomeDebts, crm2HomeGoal, crm2HomeFunnel, crm2HomeAttention, crm2HomeExpenses, crm2HomeAds, crm2HomeDirections, crm2HomeWorks, crm2HomeOpenStatus, crm2HomeOpenOverdue, crm2OrderDirection, crm2Plural, crm2Pct, crm2Money, renderCrm2Home });`,
    context,
  );
  return Object.assign(context as unknown as Home, { state });
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
  const home = loadHome("owner", ORDERS, { adBudgetByMonth: {} });
  const { from, to, prevFrom, prevTo } = home.crm2HomeRange("month", NOW);
  const october = home.crm2HomeSales(ORDERS, from, to, true);
  assert.equal(october.count, 3, "a, b, g — not the proposal or the measurement");
  assert.equal(october.revenue, 9800 + 4200 + 2400);
  // Company profit for October: margin 4700 + 1700 + 1050 = 7450, fixed costs 1000,
  // tax max(10% × 6450, 1200 / 12) = 645.
  assert.equal(october.netProfit, 7450 - 1000 - 645);
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
  const goal = loadHome("owner", ORDERS, { adBudgetByMonth: {} }).crm2HomeGoal(ORDERS, NOW);
  assert.equal(goal.goal, 50000);
  // The CRM has projects from September: September (margin 1200 − 1000, tax 100)
  // + 1–14 October (margin 7450 − 14/31 of 1000, tax 10%). January–August are not counted.
  const octoberFixed = 1000 * 14 / 31;
  const expected = (1200 - 1000 - 100) + (7450 - octoberFixed - (7450 - octoberFixed) * 0.1);
  assert.ok(Math.abs(goal.earned - expected) < 0.01, `${goal.earned} vs ${expected}`);
  assert.equal(goal.monthsLeft, 3);
  assert.ok(Math.abs(goal.perMonth - (50000 - expected) / 3) < 0.01);
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
  assert.equal(alerts["Лиды без ответа > 1 часа"].count, 0);
  assert.equal(alerts["Новые проекты дольше часа"].count, 0, "f came in less than an hour ago");
  const later = Object.fromEntries(home.crm2HomeAttention(ORDERS, true, new Date(2026, 9, 14, 13)).map((a) => [a.label, a]));
  assert.equal(later["Новые проекты дольше часа"].count, 1);
  assert.equal(later["Новые проекты дольше часа"].go, "crm2HomeOpenStatus('new')", "the inbox does not list projects in «new»");
  assert.equal(alerts["Замер без КП"].count, 1);
  assert.equal(alerts["Замер без КП"].go, "crm2HomeOpenStatus('measurement_done')");
  assert.equal(alerts["КП без ответа 3+ дня"].count, 1);
  assert.equal(alerts["Принято, нет даты монтажа"].count, 1);
  assert.equal(alerts["Сделано, нет акта"].count, 1);
  assert.equal(alerts["Просрочены оплаты"].go, "crm2Go('paymentsdue')");
  assert.equal(home.crm2HomeAttention(ORDERS, false, NOW).find((a) => a.label === "Просрочены оплаты")?.go, "crm2HomeOpenOverdue()", "a manager has no payments screen");
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
  // Owner, 2026-10-04: phone = «Пульс бизнеса», computer = this numbers home.
  assert.match(html, /function renderManagerDashboard\(\) \{\n {2}return crm2IsPhone\(\) \? renderPulseBusinessDashboard\(\) : renderCrm2Home\(\);\n\}/);
  assert.match(html, /const CRM2_PHONE_QUERY = '\(max-width: 520px\), \(max-width: 768px\) and \(pointer: coarse\)';/);
  assert.match(readFileSync("src/features/legacy-crm/pulse-theme.ts", "utf8"), /@media \(max-width: 520px\), \(max-width: 768px\) and \(pointer: coarse\) \{/, "the same phone test as the Pulse styles");
  const home = loadHome("owner", ORDERS);
  assert.equal(home.crm2OrderDirection({ serviceType: "smart_film" }), "smart_film");
  assert.equal(home.crm2OrderDirection({ serviceCategory: "Security / safety" }), "protective_film");
  assert.equal(home.crm2Plural(2, ["проект", "проекта", "проектов"]), "2 проекта");
  assert.equal(home.crm2Plural(11, ["проект", "проекта", "проектов"]), "11 проектов");
  assert.equal(home.crm2Plural(21, ["счёт", "счёта", "счетов"]), "21 счёт");
});

test("advertising reads the budget from the monthly-budget object", () => {
  const home = loadHome("owner", ORDERS);
  const { from, to } = home.crm2HomeRange("month", NOW);
  const rows = [
    { type: "expense", category: "marketing", amount: 5850, date: at(9, 3) },
    { type: "expense", category: "marketing", amount: 700, date: at(9, 4), scope: "personal" },
  ];
  const ads = home.crm2HomeAds(rows, from, to, [["Лиды", 90, ""], ["Замеры", 0, ""], ["КП", 0, ""], ["Сделки", 30, ""]], NOW);
  assert.equal(ads.budget, 9000);
  assert.equal(ads.pct, 10);
  assert.equal(ads.spent, 5850);
  assert.equal(ads.perLead, 65);
  assert.match(home.renderCrm2Home(), /бюджет = 10% выручки прошлого месяца/);
});

test("a lead claimed more than 10 minutes ago is open again; leads and new projects are separate counters", () => {
  const leads = [
    { id: "l1", receivedAt: new Date(2026, 9, 14, 9).toISOString(), claimedAt: "" },
    { id: "l2", receivedAt: new Date(2026, 9, 14, 9).toISOString(), claimedAt: new Date(2026, 9, 14, 11, 30).toISOString() },
    { id: "l3", receivedAt: new Date(2026, 9, 14, 9).toISOString(), claimedAt: new Date(2026, 9, 14, 11, 55).toISOString() },
  ];
  const home = loadHome("owner", ORDERS, {}, leads);
  const alerts = Object.fromEntries(home.crm2HomeAttention(ORDERS, true, NOW).map((a) => [a.label, a]));
  assert.equal(alerts["Лиды без ответа > 1 часа"].count, 2, "l1 and the abandoned l2; l3 is being converted");
  assert.equal(alerts["Лиды без ответа > 1 часа"].go, "crm2Go('leads')");
  const later = Object.fromEntries(home.crm2HomeAttention(ORDERS, true, new Date(2026, 9, 14, 13)).map((a) => [a.label, a]));
  assert.equal(later["Новые проекты дольше часа"].count, 1, "counted apart: they open a different list");
});

test("a mixed project's revenue goes to each of its directions, margin in proportion", () => {
  const mixed: Order = {
    id: "m", status: "installation_done", serviceType: "solar_film", rev: 3000, mar: 1200, installationDoneAt: at(9, 3),
    measurements: { rooms: [{ windows: [{ price: 2000, measureScope: "solar_film" }, { price: 500, measureScope: "decorative_film" }] }] },
    extraServices: [{ price: 500, offeringId: "decor-frost" }, { price: 999, quickProjectLine: true, serviceType: "smart_film" }],
  };
  const rows = loadHome("owner", [mixed]).crm2HomeDirections([mixed]);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(by.solar_film.revenue, 2000);
  assert.equal(by.decorative_film.revenue, 1000, "a window and a service line of the decorative direction");
  assert.equal(by.smart_film.revenue, 0, "a quick line is not counted once windows are measured");
  assert.equal(by.solar_film.marginPct, 40);
  assert.equal(by.decorative_film.marginPct, 40);
});

test("a counter opens the funnel with only its status, without filters left from earlier", () => {
  const home = loadHome("owner", ORDERS) as Home & { state: Record<string, unknown> };
  home.crm2HomeOpenStatus("measurement_done");
  assert.deepEqual(
    [home.state.statusFilter, home.state.search, home.state.managerFilter, home.state.dateFrom, home.state.dateTo, home.state.ordersPeriod, home.state.opened],
    ["measurement_done", "", "", "", "", "all", "orders:measurement_done:false"],
  );
});

test("installs count each scheduled service in its own period, as the Calendar does", () => {
  const split: Order = { id: "s", status: "installation_scheduled", rev: 5000, mar: 2000, installationAt: at(9, 20), serviceSchedules: [{}], services: [{ at: at(9, 20), sqft: 80 }, { at: at(10, 5), sqft: 120 }] };
  const home = loadHome("owner", [split]);
  const october = home.crm2HomeRange("month", NOW);
  const november = home.crm2HomeRange("month", new Date(2026, 10, 10));
  assert.equal(home.crm2HomeWorks([split], october.from, october.to, NOW).ahead, 1);
  assert.equal(home.crm2HomeWorks([split], november.from, november.to, NOW).ahead, 1, "the November service counts in November");
  // After 20 October without closing, the October visit is not «ahead» any more.
  const late = home.crm2HomeWorks([split], october.from, october.to, new Date(2026, 9, 25));
  assert.deepEqual([late.ahead, late.pending], [0, 1]);
});

test("the funnel keeps leads received in a past month even after they were closed; converted ones count once", () => {
  const all = [
    { lead_id: "w1", source: "website", created_at: at(8, 5), pipeline_status: { status_code: "CLOSED_LOST" } },
    { lead_id: "w2", source: "facebook_messenger", created_at: at(8, 6), pipeline_status: { status_code: "NEW_LEAD" } },
    { lead_id: "w3", source: "website", created_at: at(8, 7), pipeline_status: { status_code: "WON" } },
    { lead_id: "x", source: "phone", created_at: at(8, 8) },
  ];
  const orders: Order[] = [...ORDERS, { id: "h", status: "new", rev: 0, mar: 0, createdAt: at(8, 7), canonicalLeadId: "w3" }];
  const home = loadHome("owner", orders, {}, [], all);
  const september = home.crm2HomeRange("month", new Date(2026, 8, 20));
  // September projects: a (20 Sep), c (1 Sep), h (from w3) — plus w1 (closed) and w2; w3 is h; «phone» is not an inbox source.
  assert.equal(home.crm2HomeFunnel(orders, september.from, september.to)[0][1], 3 + 2);
});

test("a manager's overdue counter opens the funnel with only overdue projects", () => {
  const home = loadHome("manager", ORDERS) as Home & { state: Record<string, unknown> };
  home.crm2HomeOpenOverdue();
  assert.equal(home.state.opened, "orders::true", "the filter is on before the funnel opens");
  assert.equal(home.state.ordersOverdueOnly, true);
  assert.equal(home.state.statusFilter, "");
  assert.equal(home.state.search, "");
  const orders = html.slice(html.indexOf("function renderOrders() {"), html.indexOf("const ordersView =", html.indexOf("function renderOrders() {")));
  assert.match(orders, /if \(state\.ordersOverdueOnly && !crm2OrderOverdue\(o\)\) return false;/);
  assert.match(html, /function clearOrderFilters\(\) \{\n {2}state\.search = ''; state\.statusFilter = ''; state\.managerFilter = '';\n {2}state\.ordersOverdueOnly = false;/);
  assert.match(html, /onclick="state\.ordersOverdueOnly=false; render\(\);"[^>]*>Просроченные оплаты ✕/);
});

test("«Установлено» counts the area of quick-entry projects", () => {
  const quick: Order = { id: "q", status: "installation_done", rev: 2000, mar: 800, installationDoneAt: at(9, 6), quickSqft: 140 };
  const home = loadHome("owner", [quick]);
  const { from, to } = home.crm2HomeRange("month", NOW);
  assert.equal(home.crm2HomeWorks([quick], from, to, NOW).sqft, 140);
});

test("date-only finance rows belong to their calendar day; a converted lead stays in the month it came in", () => {
  const home = loadHome("owner", ORDERS);
  const october = home.crm2HomeRange("month", NOW);
  const rows = [
    { type: "expense", category: "marketing", amount: 100, date: "2026-10-01" },
    { type: "expense", category: "marketing", amount: 900, date: "2026-11-01" },
  ];
  assert.equal(home.crm2HomeExpenses(rows, october.from, october.to).total, 100, "1 Oct is October, 1 Nov is not");

  const leads = [{ lead_id: "w9", source: "website", created_at: new Date(2026, 8, 30, 18).toISOString() }];
  const orders: Order[] = [{ id: "p", status: "new", rev: 0, mar: 0, createdAt: new Date(2026, 9, 1, 9).toISOString(), canonicalLeadId: "w9" }];
  const withLead = loadHome("owner", orders, {}, [], leads);
  const september = withLead.crm2HomeRange("month", new Date(2026, 8, 20));
  assert.equal(withLead.crm2HomeFunnel(orders, september.from, september.to)[0][1], 1);
  assert.equal(withLead.crm2HomeFunnel(orders, october.from, october.to)[0][1], 0);
});

test("a budget estimated from this month says so", () => {
  const home = loadHome("owner", ORDERS);
  const { from, to } = home.crm2HomeRange("month", NOW);
  const funnel: Array<[string, number, string]> = [["Лиды", 1, ""], ["Замеры", 0, ""], ["КП", 0, ""], ["Сделки", 0, ""]];
  assert.equal(home.crm2HomeAds([], from, to, funnel, NOW).estimate, false);
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /оценка: \$\{ads\.pct\}% выручки этого месяца — в прошлом выручки не было/);
});

test("a closed project keeps each service visit in its own month", () => {
  const closed: Order = { id: "z", status: "act_signed", rev: 6000, mar: 2400, installationAt: at(9, 20), installationDoneAt: at(10, 6), serviceSchedules: [{}], services: [{ at: at(9, 20), sqft: 80 }, { at: at(10, 5), sqft: 120 }] };
  const home = loadHome("owner", [closed]);
  const october = home.crm2HomeRange("month", NOW);
  const november = home.crm2HomeRange("month", new Date(2026, 10, 10));
  const oct = home.crm2HomeWorks([closed], october.from, october.to, NOW);
  const nov = home.crm2HomeWorks([closed], november.from, november.to, NOW);
  assert.deepEqual([oct.done, oct.sqft], [1, 80], "October's service and its area stay in October");
  assert.deepEqual([nov.done, nov.sqft, nov.ahead], [1, 120, 0]);
});

test("every number on the home opens the funnel without filters left from earlier", () => {
  const owner = loadHome("owner", ORDERS).renderCrm2Home();
  const manager = loadHome("manager", ORDERS).renderCrm2Home();
  for (const page of [owner, manager]) {
    assert.doesNotMatch(page, /onclick="crm2Go\('orders'\)"/);
    assert.match(page, /onclick="crm2HomeOpenStatus\(''\)"/);
  }
});

test("net profit counts a month's fixed costs even when it had no deals", () => {
  const home = loadHome("owner", ORDERS, { adBudgetByMonth: {} });
  // November has no deals: it loses its fixed costs and the minimum tax.
  const november = home.crm2HomeRange("month", new Date(2026, 10, 10));
  assert.equal(home.crm2HomeSales(ORDERS, november.from, november.to, true).netProfit, -1000 - 100);
  // A quarter adds up its months: Oct–Dec = October's profit + two empty months.
  const quarter = home.crm2HomeRange("quarter", NOW);
  assert.equal(home.crm2HomeSales(ORDERS, quarter.from, quarter.to, true).netProfit, (7450 - 1000 - 645) - 2 * 1100);
});

test("a loss is written as −$1100, not $-1100", () => {
  const home = loadHome("owner", ORDERS) as unknown as { crm2Money: (value: number) => string };
  assert.equal(home.crm2Money(-1100), "−$1100");
  assert.equal(home.crm2Money(1100), "$1100");
  assert.equal(home.crm2Money(0), "$0");
});

test("net profit pays the whole month's ad budget, also the shares of unagreed proposals", () => {
  // October: budget 900; the agreed projects already carry 300 of it in their margin.
  const orders: Order[] = [
    { id: "a", status: "payment_received", rev: 9800, mar: 4700, ad: 200, installationDoneAt: at(9, 3), createdAt: at(9, 1) },
    { id: "g", status: "proposal_accepted", rev: 2400, mar: 1050, ad: 100, proposalAcceptedAt: at(9, 12), createdAt: at(9, 2) },
    { id: "d", status: "proposal_sent", rev: 3348, mar: 1300, ad: 600, proposalSentAt: at(9, 8), createdAt: at(9, 5) },
  ];
  const home = loadHome("owner", orders, { adBudgetByMonth: { 9: 900 } });
  const { from, to } = home.crm2HomeRange("month", NOW);
  const beforeAds = (4700 + 200) + (1050 + 100);
  const gross = beforeAds - 900;
  const tax = Math.max((gross - 1000) * 0.1, 100);
  assert.ok(Math.abs(home.crm2HomeSales(orders, from, to, true).netProfit - (gross - 1000 - tax)) < 0.01);
});

test("installed area is film: per-sq-ft extra work such as old-film removal is not added", () => {
  const removal = { unit: "sqft", qty: 100, label: "Снятие старой плёнки" };
  const film = { unit: "sqft", qty: 60, quickProjectLine: true };
  const project: Order = { id: "r", status: "act_signed", rev: 3000, mar: 1200, installationDoneAt: at(9, 6), serviceSchedules: [{}], services: [{ at: at(9, 6), sqft: 100 }, { at: at(9, 6), sqft: 0, lines: [removal] }, { at: at(9, 7), sqft: 0, lines: [film] }] };
  const home = loadHome("owner", [project]);
  const { from, to } = home.crm2HomeRange("month", NOW);
  assert.equal(home.crm2HomeWorks([project], from, to, NOW).sqft, 100 + 60);
});

