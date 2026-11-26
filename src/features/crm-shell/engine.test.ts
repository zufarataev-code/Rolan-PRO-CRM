import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { composeEngineSource, resolveTimeZone, runCrmEngine } from "./engine";
import { CRM_LEGACY_SECTIONS, crmNavFor, crmSectionSrc } from "./nav";
import type { CrmCalendar, CrmClients, CrmInventory, CrmTasks, CrmLeadLinks, CrmOverview, CrmProjectPage, CrmProjectsBoard } from "./types";

const source = composeEngineSource();
const script = new vm.Script(source);
// The CRM's own demo workspace, produced by the CRM's own code.
const payload = runCrmEngine<Record<string, unknown>>(null, { legacyUserIds: [], role: "owner" }, { model: "overview" },
  new vm.Script(`${source}\ncrmShellRun = function () { seedDemo(); migrateSchema(); return JSON.stringify(db); };`));
const owner = { legacyUserIds: ["u_o1"], role: "owner" as const, timeZone: "America/Los_Angeles" };

test("the overview is the CRM's own numbers for the signed-in owner", () => {
  const overview = runCrmEngine<CrmOverview>(payload, owner, { model: "overview" }, script);
  assert.equal(overview.user.id, "u_o1");
  assert.equal(overview.activeCount, 2);
  assert.equal(Math.round(overview.activeRevenue), 3236);
  assert.deepEqual(overview.funnel.map((stage) => stage.id), ["lead", "consult", "measure", "proposal", "install", "payment"]);
  assert.equal(overview.attention[0]?.next, "Монтаж назначен");
});

test("the funnel has the CRM kanban's columns and each card carries its next step", () => {
  const board = runCrmEngine<CrmProjectsBoard>(payload, { legacyUserIds: ["u_m1"], role: "manager" }, { model: "projects" }, script);
  assert.equal(board.user.role, "manager");
  assert.deepEqual(board.columns.map((column) => column.id), ["lead", "consult", "measure", "proposal", "install", "payment", "done"]);
  const install = board.columns.find((column) => column.id === "install");
  assert.equal(install?.cards[0]?.number, "R-2604-001");
  assert.equal(install?.cards[0]?.status, "Монтаж назначен");
  assert.equal(install?.cards[0]?.address, "Los Angeles, CA, 633 W 5th St");
});

test("a project shows the working card's nine stages, services and windows", () => {
  const page = runCrmEngine<CrmProjectPage>(payload, owner, { model: "project", projectId: "o1" }, script);
  const project = page.project;
  assert.ok(project);
  assert.deepEqual(project.stages.map((stage) => stage.label), ["Новый", "Консультация", "Замер", "КП", "Производство", "Монтаж", "Акт", "Оплата", "Готово"]);
  assert.equal(project.stages.find((stage) => stage.state === "current")?.label, "Монтаж");
  assert.equal(project.stageDone, 5);
  assert.equal(project.lines.length, 1);
  assert.equal(project.windows.length, 3);
  assert.equal(project.canSeeMoney, true);
  assert.equal(runCrmEngine<CrmProjectPage>(payload, owner, { model: "project", projectId: "missing" }, script).project, null);
});

test("a project with its own address shows it, and an unknown status is not work in progress", () => {
  const changed = JSON.parse(JSON.stringify(payload)) as { orders: Record<string, unknown>[] };
  changed.orders[0].address = "Pasadena, CA, 1 Job Site Rd";
  changed.orders[1].status = "cancelled";
  const overview = runCrmEngine<CrmOverview>(changed, owner, { model: "overview" }, script);
  assert.deepEqual(overview.attention.map((card) => card.id), ["o1"]);
  assert.equal(overview.attention[0].address, "Pasadena, CA, 1 Job Site Rd");
});

test("a lead that already has a project is linked to it, an archived one is marked", () => {
  const changed = JSON.parse(JSON.stringify(payload)) as { orders: Record<string, unknown>[]; archivedOrders?: Record<string, unknown>[] };
  changed.orders[0].canonicalLeadId = "lead-1";
  changed.archivedOrders = [{ id: "old", number: "R-OLD", canonicalLeadId: "lead-2" }];
  const result = runCrmEngine<CrmLeadLinks>(changed, owner, { model: "leadLinks" }, script);
  assert.deepEqual(result.links, { "lead-1": { projectId: "o1", number: "R-2604-001", archived: false }, "lead-2": { projectId: "", number: "R-OLD", archived: true } });
});

test("the calendar is the working calendar's events, with consultations booked from leads", () => {
  const consultation = {
    consultation_id: "c-77", status: "scheduled", scheduled_start_at: "2026-04-26T20:00:00Z", scheduled_end_at: "2026-04-26T21:00:00Z",
    location_address: "Glendale, CA, 5 Lead St", lead: { lead_id: "l-9", name: "Lead Nine", lead_code: "L-9" }, client: null,
    assigned_manager: null, assigned_consultant: null, manager_notes: "",
  };
  const result = runCrmEngine<CrmCalendar>(payload, owner, { model: "calendar", from: "2026-04-20", to: "2026-04-26" }, script, { consultations: [consultation] });
  assert.deepEqual([result.from, result.to], ["2026-04-20", "2026-04-26"]);
  const install = result.events.find((event) => event.kind === "install" && event.projectId === "o1");
  // 09:00 UTC is 02:00 in Los Angeles on the same day.
  assert.deepEqual([install?.day, install?.time, install?.client, install?.people], ["2026-04-26", "02:00", "Acme Business Tower", "Ринат, Нурик"]);
  const booked = result.events.find((event) => event.client === "Lead Nine");
  assert.deepEqual([booked?.kind, booked?.day, booked?.projectId, booked?.address], ["consultation", "2026-04-26", "", "Glendale, CA, 5 Lead St"]);
  const wide = runCrmEngine<CrmCalendar>(payload, owner, { model: "calendar", from: "2026-01-01", to: "2026-12-31" }, script);
  assert.deepEqual([wide.from, wide.to], ["2026-01-01", "2026-01-07"], "a range longer than two months is cut to a week");
});

test("clients are the working «Клиенты» list: own projects, money and addresses; a manager sees only clients of their projects", () => {
  const all = runCrmEngine<CrmClients>(payload, owner, { model: "clients" }, script);
  assert.deepEqual(all.counts, { all: 4, b2c: 2, b2b: 2, regular: 0 });
  assert.deepEqual(all.clients.map((client) => client.id), ["c2", "c1", "c3", "c4"], "the latest project first, a client without projects last");
  const acme = all.clients.find((client) => client.id === "c1");
  assert.deepEqual([acme?.b2b, acme?.projects, acme?.addresses, Math.round(acme?.debt ?? 0)], [true, 1, 1, 3236]);
  assert.deepEqual(acme?.recent, [{ id: "o1", number: "R-2604-001", status: "Монтаж назначен" }]);
  assert.equal(all.clients.find((client) => client.id === "c3")?.referredBy, "Acme Business Tower");
  assert.ok(all.clients.find((client) => client.id === "c2")?.search.includes("santa monica"), "the search box finds a client by address");
  const mine = runCrmEngine<CrmClients>(payload, { legacyUserIds: ["u_m1"], role: "manager" }, { model: "clients" }, script);
  assert.deepEqual(mine.clients.map((client) => client.id).sort(), ["c1", "c3"]);
});

test("tasks are the working «Задачи» list: open by due day in the viewer's zone, mine marked, the latest done kept", () => {
  const withTasks = {
    ...payload,
    tasks: [
      { id: "t1", title: "Купить плёнку", dueAt: "2026-11-24T09:00", teamIds: [], responsibleId: "u_m1", clientId: null, notes: "", status: "open" },
      { id: "t2", title: "Перезвонить: Acme", dueAt: "2026-11-23T02:30:00.000Z", teamIds: ["u_o1"], responsibleId: "u_o1", clientId: "c1", notes: "КП", status: "open", source: "rolan_agent" },
      { id: "t3", title: "Без срока", dueAt: "", teamIds: [], responsibleId: "", status: "open" },
      { id: "t4", title: "Сделано", dueAt: "2026-11-20T10:00", status: "done", doneAt: "2026-11-20T18:00:00.000Z" },
      { id: "t5", title: "📞 Перезвонить: старый звонок", dueAt: "2026-11-23T03:15:00.000", teamIds: [], responsibleId: "", status: "open" },
    ],
  };
  const tasks = runCrmEngine<CrmTasks>(withTasks, owner, { model: "tasks" }, script);
  assert.deepEqual(tasks.open.map((task) => task.id), ["t2", "t5", "t1", "t3"], "a UTC time falls on the viewer's day; no date last");
  const legacy = tasks.open.find((task) => task.id === "t5");
  assert.deepEqual([legacy?.dueKey, legacy?.time], ["2026-11-22", "19:15"], "an old callback without its Z is UTC for both day and time");
  const call = tasks.open[0];
  assert.deepEqual([call?.dueKey, call?.time, call?.mine, call?.client, call?.agent], ["2026-11-22", "18:30", true, "Acme Business Tower", true]);
  assert.deepEqual([tasks.open[2]?.dueKey, tasks.open[2]?.time, tasks.open[2]?.mine, tasks.open[2]?.responsible.length > 0], ["2026-11-24", "09:00", false, true]);
  assert.equal(tasks.open[3]?.dueKey, "");
  assert.deepEqual([tasks.done.map((task) => task.id), tasks.doneTotal], [["t4"], 1]);
});

test("the warehouse is the working «Склад» overview: stock value, what to buy, purchases in work, film by model", () => {
  const [low, full] = (payload.settings as { catalog: Array<{ id: string }> }).catalog;
  const stocked = {
    ...payload,
    inventory: [
      { id: "r1", catalogId: low.id, widthMm: 1524, originalLengthM: 30, remainingLengthM: 3, costTotal: 600 },
      { id: "r2", catalogId: full.id, widthMm: 1524, originalLengthM: 30, remainingLengthM: 30, costTotal: 900 },
    ],
    supplies: [
      { id: "s1", name: "Ракель", unit: "pcs", qty: 0, minQty: 2, maxQty: 6, costPerUnit: 8, vendorId: "v_3m", location: "Warehouse" },
      { id: "s2", name: "Нож", unit: "pcs", qty: 10, minQty: 2, costPerUnit: 3 },
    ],
    purchaseRequests: [
      { id: "p1", number: "PUR-2026-0001", kind: "film", itemId: low.id, itemNameSnapshot: "Madico Sunscape Select 5", qty: 5, unit: "м", orderId: "o1", responsibleId: "u_m1", status: "requested", createdAt: "2026-11-20T10:00:00.000Z" },
      { id: "p2", number: "PUR-2026-0002", kind: "supply", itemId: "s2", qty: 4, unit: "шт", status: "received", createdAt: "2026-11-21T10:00:00.000Z" },
    ],
    tools: [{ id: "t1", name: "Термофен", invNumber: "7", condition: "repair", holderId: "u_m1" }],
    inventoryMovements: [{ id: "m1", at: "2026-11-22T18:00:00.000Z", kind: "film", itemName: "Madico Sunscape Select 5", direction: "issue", qty: 2.5, unit: "м", orderId: "o1", createdBy: "u_m1" }],
  };
  const stock = runCrmEngine<CrmInventory>(stocked, { legacyUserIds: ["u_m1"], role: "manager" }, { model: "inventory" }, script);
  // The working CRM drafts a reorder for the short supply with a vendor on its own, so two purchases are in work.
  assert.deepEqual(stock.kpi, { stockValue: 990, needs: 2, out: 1, active: 2 }, "film left at its lot price plus supplies at unit cost");
  assert.deepEqual(stock.needs.map((need) => [need.id, need.qty, need.critical]), [[`film:${low.id}`, 3, false], ["supply:s1", 0, true]]);
  assert.deepEqual([stock.needs[1]?.vendor, stock.needs[1]?.draft], ["3M", stock.active[0]?.number], "the supply names its vendor and its auto draft");
  assert.deepEqual(stock.active.map((row) => [row.status, row.project?.id ?? null]), [["draft", null], ["requested", "o1"]], "newest first");
  assert.ok(stock.active[1]?.responsible);
  assert.equal(stock.purchasesTotal, 3);
  assert.deepEqual(stock.film.map((film) => [film.id, film.rolls, film.lengthM, film.sqft, film.status]), [[low.id, 1, 3, 49, "reorder"], [full.id, 1, 30, 492, "ok"]]);
  assert.deepEqual(stock.supplies.map((supply) => [supply.id, supply.status]), [["s1", "critical"], ["s2", "ok"]], "short supplies first");
  assert.deepEqual([stock.tools[0]?.condition, stock.tools[0]?.problem], ["В ремонте", true]);
  assert.deepEqual([stock.movements[0]?.receipt, stock.movements[0]?.qty, stock.movements[0]?.project?.id], [false, 2.5, "o1"]);
});

test("no CRM card of an office role — no data", () => {
  assert.deepEqual(runCrmEngine(payload, { legacyUserIds: [], role: "owner" }, { model: "overview" }, script), { error: "no_card" });
  assert.deepEqual(runCrmEngine(payload, { legacyUserIds: ["u_i1", "u_z1"], role: "manager" }, { model: "projects" }, script), { error: "no_card" });
});

test("the calculation changes neither the workspace it was given nor the server's time zone", () => {
  const before = JSON.stringify(payload);
  const zone = process.env.TZ;
  runCrmEngine(payload, { ...owner, timeZone: "Asia/Tashkent" }, { model: "overview" }, script);
  assert.equal(JSON.stringify(payload), before);
  assert.equal(process.env.TZ, zone);
  assert.equal(resolveTimeZone("Not/AZone"), "America/Los_Angeles");
  assert.equal(resolveTimeZone("Asia/Tashkent"), "Asia/Tashkent");
});

test("every old section in the new menu is one the working CRM agrees to open by address", () => {
  const allowed = source.match(/function crmSectionOpenAllowed\(key\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(allowed);
  for (const item of CRM_LEGACY_SECTIONS) assert.ok(allowed.includes(`'${item.key}'`), item.key);
  const ownerOnly = allowed.match(/if \(\[(.*?)\]\.includes\(key\)\) return role === 'owner'/)?.[1] ?? "";
  for (const item of CRM_LEGACY_SECTIONS.filter((entry) => entry.ownerOnly)) assert.ok(ownerOnly.includes(`'${item.key}'`), item.key);
  const managerTitles = crmNavFor("manager").flatMap((group) => group.items).map((item) => item.title);
  assert.ok(!managerTitles.includes("Деньги") && !managerTitles.includes("Настройки"));
  assert.ok(CRM_LEGACY_SECTIONS.some((item) => item.key === "orders"));
  assert.equal(crmSectionSrc("leads", "manager")?.src, "/legacy-crm#/section/leads");
  assert.equal(crmSectionSrc("calendar", "manager")?.src, "/legacy-crm#/section/calendar");
  assert.equal(crmSectionSrc("servicePricing", "manager")?.src, "/legacy-crm#/service-pricing");
  assert.equal(crmSectionSrc("installerOps", "owner")?.src, "/legacy-crm#/installer-operations");
  assert.equal(crmSectionSrc("accounting", "manager"), null);
  assert.equal(crmSectionSrc("anything", "owner"), null);
});
