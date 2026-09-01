import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

function visibilityContext() {
  const start = html.indexOf("function orderUserCanManage");
  const end = html.indexOf("const ORDER_FINANCIAL_TIMELINE_KEYS", start);

  assert.notEqual(start, -1, "visibility helpers must exist in legacy CRM");
  assert.notEqual(end, -1, "visibility helper boundary must exist");

  const context = vm.createContext({
    db: {
      orders: [
        { id: "owner-order", clientId: "client-a", managerId: "manager-a" },
        { id: "other-order", clientId: "client-b", managerId: "manager-b" },
        {
          id: "field-order",
          clientId: "client-c",
          managerId: "manager-b",
          measurerId: "measurer-a",
          installerIds: ["installer-a"],
        },
        { id: "unassigned", clientId: "client-d", managerId: null },
      ],
      clients: [
        { id: "client-a" },
        { id: "client-b" },
        { id: "client-c" },
        { id: "client-d" },
      ],
    },
    currentUser: () => null,
  });

  vm.runInContext(`${html.slice(start, end)}\nthis.visibility = { orderUserCanAccess, orderUserCanSeeMoney, visibleOrdersForUser, visibleClientsForUser };`, context);
  return context.visibility as {
    orderUserCanAccess: (order: unknown, user: unknown) => boolean;
    orderUserCanSeeMoney: (order: unknown, user: unknown) => boolean;
    visibleOrdersForUser: (user: unknown) => Array<{ id: string }>;
    visibleClientsForUser: (user: unknown) => Array<{ id: string }>;
  };
}

test("owner sees every order, including unassigned work", () => {
  const visibility = visibilityContext();
  const orders = visibility.visibleOrdersForUser({ id: "owner", role: "owner" });

  assert.deepEqual(orders.map((order) => order.id), [
    "owner-order",
    "other-order",
    "field-order",
    "unassigned",
  ]);
});

test("manager sees only orders assigned to that manager and their clients", () => {
  const visibility = visibilityContext();
  const manager = { id: "manager-a", role: "manager" };

  assert.deepEqual(
    visibility.visibleOrdersForUser(manager).map((order) => order.id),
    ["owner-order"],
  );
  assert.deepEqual(
    visibility.visibleClientsForUser(manager).map((client) => client.id),
    ["client-a"],
  );
});

test("field roles see only explicitly assigned work", () => {
  const visibility = visibilityContext();
  const fieldOrder = { managerId: "manager-b", measurerId: "measurer-a", installerIds: ["installer-a"] };

  assert.equal(visibility.orderUserCanAccess(fieldOrder, { id: "measurer-a", role: "measurer" }), true);
  assert.equal(visibility.orderUserCanAccess(fieldOrder, { id: "measurer-b", role: "measurer" }), false);
  assert.equal(visibility.orderUserCanAccess(fieldOrder, { id: "installer-a", role: "installer" }), true);
  assert.equal(visibility.orderUserCanAccess(fieldOrder, { id: "installer-b", role: "installer" }), false);
});

test("surveyors and installers never see project financial totals", () => {
  const visibility = visibilityContext();
  const fieldOrder = { managerId: "manager-a", measurerId: "measurer-a", installerIds: ["installer-a"] };

  assert.equal(visibility.orderUserCanSeeMoney(fieldOrder, { id: "owner", role: "owner" }), true);
  assert.equal(visibility.orderUserCanSeeMoney(fieldOrder, { id: "manager-a", role: "manager" }), true);
  assert.equal(visibility.orderUserCanSeeMoney(fieldOrder, { id: "manager-b", role: "manager" }), false);
  assert.equal(visibility.orderUserCanSeeMoney(fieldOrder, { id: "measurer-a", role: "measurer" }), false);
  assert.equal(visibility.orderUserCanSeeMoney(fieldOrder, { id: "installer-a", role: "installer" }), false);
});

test("field-role calendar and proposal actions keep project totals hidden", () => {
  assert.match(html, /function renderCalendarSummary[\s\S]*?const canSeeMoney = orderUserCanManage\(\);/);
  assert.match(html, /\$\{canSeeMoney \? `<div class="calendar-kpi"[\s\S]*?Сумма заказов[\s\S]*?` : ''\}/);
  assert.match(html, /function openProfessionalKP\(oid\)[\s\S]*?if \(!orderUserOwns\(o\)\)/);
  assert.match(html, /function printProposal\(oid\)[\s\S]*?if \(!orderUserOwns\(o\)\)/);
});

test("installer order workspace exposes only operational documents and personal pay", () => {
  assert.match(html, /function installerOrderPrimaryAction\(o\)/);
  assert.match(html, /isInstaller \? 'Рабочие документы и акт' : 'КП, техлист, оплата'/);
  assert.match(html, /isInstaller \? '' : renderOrderCleanCard\(\{ icon: '💵', title: 'Экономика'/);
  assert.match(html, /u\.role === 'installer' \|\| !state\.orderClassicMode/);
  assert.match(html, /Мои расценки/);
  assert.match(html, /Стоимость заказа для клиента и маржа компании скрыты/);
});

test("manager-facing surfaces use the shared visibility helpers", () => {
  assert.match(html, /function renderManagerDashboard\(\)[\s\S]*?const orders = visibleOrdersForUser\(u\);/);
  assert.match(html, /function renderOrders\(\)[\s\S]*?const filtered = visibleOrdersForUser\(u\)/);
  assert.match(html, /function renderGlobalSearch\(\)[\s\S]*?const orders = visibleOrdersForUser\(\)\.filter/);
  assert.match(html, /function orderMatchesCalendarRole[\s\S]*?if \(!orderUserCanAccess\(o, u\)\) return false;/);
});
