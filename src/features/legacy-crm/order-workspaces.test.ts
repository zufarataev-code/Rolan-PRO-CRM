import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const slice = (from: string, to: string) => {
  const start = html.indexOf(from);
  assert.ok(start >= 0, from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(end > start, to);
  return html.slice(start, end);
};

test("order operations open in focused workspaces instead of inline accordions", () => {
  const start = html.indexOf("function renderOrderCleanDetails");
  const end = html.indexOf("function renderInstallerTechnicalWorkspace", start);
  const cleanOrder = html.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(html, /function renderOrderWorkspaceTile/);
  assert.match(html, /function openOrderWorkspaceFromTemplate/);
  assert.match(cleanOrder, /class="order-workspace-grid project-workspace-templates"/);
  assert.doesNotMatch(cleanOrder, /renderOrderCleanCard\(/);

  for (const title of [
    "Клиент и связь",
    "Замер",
    "КП и документы",
    "Календарь и команда",
    "Оплата",
    "Маршрут заказа",
    "Файлы и история",
  ]) {
    assert.ok(cleanOrder.includes(title), `missing workspace: ${title}`);
  }
});

test("order workspace dialog keeps the order context and a clear close action", () => {
  assert.match(html, /order-workspace-modal-kicker[\s\S]*?order\?\.number/);
  assert.match(html, /aria-label="Закрыть рабочее окно"/);
  assert.match(html, /if\(event\.target===this\) closeModal\(\)/);
  assert.match(html, /@media \(max-width: 1000px\)[\s\S]*?order-workspace-grid[\s\S]*?grid-template-columns: 1fr/);
});

test("project command center opens the existing workspaces and stays role-safe", () => {
  assert.match(html, /data-project-workspace-key="\$\{academyEsc\(safeKey\)\}"/);
  assert.match(html, /function projectCardOpenWorkspace\(key\)[\s\S]*?\.order-workspace-tile/);
  assert.match(html, /function renderProjectCommandNav/);
  assert.match(html, /function renderProjectCommandSide/);
  assert.match(html, /const financialCard = money && !installer \?/);
  assert.match(html, /economics \? `<div class="project-command-metric"><span>Себестоимость/);
  assert.match(html, /function projectCardVisits\(o, lines = projectLines\(o\)\)/);
  assert.match(html, /function renderProjectCardSchedule\(o, unplanned, plan\) \{\n  const visits = projectCardVisits\(o\);/);
  assert.match(html, /@media \(max-width: 760px\)[\s\S]*?project-command-side \{ grid-template-columns: 1fr; \}/);
});

test("owner and manager navigation keeps documents, the client portal and schedule requests reachable", () => {
  const nav = html.slice(html.indexOf("function renderProjectCommandNav"), html.indexOf("function renderProjectCommandSide"));
  const primary = html.slice(html.indexOf("function orderPrimaryNextAction"), html.indexOf("function installerOrderPrimaryAction"));

  assert.match(nav, /money && pendingClientRequests\(o\)\.length \? \[\['request', '⚠ Запрос клиента'\]\]/);
  assert.match(nav, /\['estimate', 'Расчёт \/ КП'\]/);
  assert.match(nav, /\['documents', installer \? 'ТЗ' : 'Документы \/ портал'\]/);
  assert.match(primary, /projectCardOpenWorkspace\('request'\)/);
  assert.match(html, /key: 'documents'[\s\S]{0,900}title: workDocsOnly \? 'Рабочие документы' : 'КП и документы'/);
  assert.match(html, /title: 'Ссылка клиенту'/);
  assert.match(html, /resolveClientScheduleRequest\('\$\{o\.id\}','\$\{r\.id\}',true\)/);
  assert.match(html, /resolveClientScheduleRequest\('\$\{o\.id\}','\$\{r\.id\}',false\)/);
});

function requestAccessContext(role: "owner" | "manager" | "measurer" | "installer", userId: string = role) {
  const order = {
    id: "o1",
    managerId: "manager",
    measurerId: "measurer",
    installerIds: ["installer"],
    measurementAt: "2026-10-12T16:00:00.000Z",
    clientRequests: [{
      id: "r1",
      eventType: "measure",
      type: "reschedule",
      requestedAt: "2026-10-13T16:00:00.000Z",
      status: "new",
    }],
    timeline: [],
  };
  const users = ["owner", "manager", "other-manager", "measurer", "installer"].map(id => ({
    id,
    role: id === "other-manager" ? "manager" : id,
  }));
  const calls = { clicks: 0, saves: 0, notices: 0, renders: 0, alerts: [] as string[] };
  const context: any = vm.createContext({
    Date,
    db: { orders: [order], users },
    state: { currentUserId: userId, openOrderId: order.id },
    getUser: (id: string) => users.find(user => user.id === id),
    pendingClientRequests: (value: any) => value.clientRequests.filter((request: any) => request.status === "new"),
    projectServicesNextAction: () => ({ title: "Полевое действие" }),
    fmtDateTime: (value: string) => value,
    measureAllWindows: () => [],
    document: { querySelector: () => ({ click: () => { calls.clicks += 1; } }) },
    orderEventInfo: () => ({ title: "Замер", field: "measurementAt" }),
    save: () => { calls.saves += 1; },
    notifyClientRequestResolved: () => { calls.notices += 1; },
    render: () => { calls.renders += 1; },
    alert: (message: string) => { calls.alerts.push(message); },
  });
  vm.runInContext(slice("function getOrder(id) {", "function visibleOrdersForUser("), context);
  vm.runInContext(slice("function orderPrimaryNextAction(o) {", "function installerOrderPrimaryAction("), context);
  vm.runInContext(slice("function resolveClientScheduleRequest(orderId, requestId, accepted) {", "function renderClientPortalScheduleControl("), context);
  vm.runInContext(slice("function projectCardOpenWorkspace(key) {", "function openOrderWorkspaceFromTemplate("), context);
  return { context, order, calls };
}

test("field roles cannot surface, open or resolve a client schedule request", () => {
  assert.match(html, /const pendingRequests = orderUserCanResolveClientRequests\(o, u\) \? pendingClientRequests\(o\) : \[\];/);
  for (const role of ["measurer", "installer"] as const) {
    const { context, order, calls } = requestAccessContext(role);
    // The measurer gets his own step (Owner, 2026-10-24), never the client request.
    assert.notEqual(context.orderPrimaryNextAction(order).title, "Ответить на запрос клиента", `${role} primary action`);
    if (role === "installer") assert.equal(context.orderPrimaryNextAction(order).title, "Полевое действие");
    assert.equal(context.projectCardOpenWorkspace("request"), false, `${role} workspace`);
    assert.equal(context.resolveClientScheduleRequest(order.id, "r1", true), false, `${role} handler`);
    assert.equal(order.clientRequests[0].status, "new");
    assert.equal(order.measurementAt, "2026-10-12T16:00:00.000Z");
    assert.deepEqual([calls.clicks, calls.saves, calls.notices, calls.renders], [0, 0, 0, 0]);
    assert.equal(calls.alerts.length, 1);
  }
});

test("owner and assigned manager keep client schedule request access", () => {
  for (const role of ["owner", "manager"] as const) {
    const { context, order, calls } = requestAccessContext(role);
    assert.equal(context.orderPrimaryNextAction(order).title, "Ответить на запрос клиента", `${role} primary action`);
    assert.equal(context.projectCardOpenWorkspace("request"), true, `${role} workspace`);
    assert.equal(context.resolveClientScheduleRequest(order.id, "r1", true), true, `${role} handler`);
    assert.equal(order.clientRequests[0].status, "accepted");
    assert.equal(order.measurementAt, "2026-10-13T16:00:00.000Z");
    assert.deepEqual([calls.clicks, calls.saves, calls.notices, calls.renders], [1, 1, 1, 1]);
  }

  const unassigned = requestAccessContext("manager", "other-manager");
  assert.equal(unassigned.context.projectCardOpenWorkspace("request"), false);
  assert.equal(unassigned.context.resolveClientScheduleRequest(unassigned.order.id, "r1", false), false);
  assert.equal(unassigned.order.clientRequests[0].status, "new");
  assert.equal(unassigned.calls.notices, 0);
});
