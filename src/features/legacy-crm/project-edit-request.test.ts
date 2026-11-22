import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-22: the clear project card has «Редактировать»; a manager asks
// the owner before changing a closed project.
const cabinet = readFileSync(join(process.cwd(), "private/legacy/project-cabinet.js"), "utf8");
const html = readFileSync(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");

function sandbox(users: any[], current: string) {
  const ctx: any = {
    db: { users, notifications: [] as any[] },
    state: { currentUserId: current },
    orders: [] as any[],
    rendered: 0,
  };
  ctx.getOrder = (id: string) => ctx.orders.find((o: any) => o.id === id);
  ctx.getUser = (id: string) => users.find(u => u.id === id);
  ctx.currentUser = () => ctx.getUser(ctx.state.currentUserId);
  ctx.pushInAppNotification = (userId: string, title: string) => ctx.db.notifications.push({ userId, title });
  ctx.uid = (() => { let n = 0; return () => `id${++n}`; })();
  ctx.save = () => {};
  ctx.render = () => { ctx.rendered += 1; };
  ctx.prompt = () => ctx.promptAnswer;
  ctx.promptAnswer = "поменять адрес";
  ctx.confirm = () => true;
  ctx.jsQuote = (v: string) => v;
  ctx.academyEsc = (v: string) => v;
  ctx.fmtDateTime = (v: string) => v;
  vm.createContext(ctx);
  vm.runInContext(cabinet, ctx);
  return ctx;
}

const users = [
  { id: "own", role: "owner", name: "Zufar" },
  { id: "mgr", role: "manager", name: "Misha" },
];

test("a manager is locked only on a closed project", () => {
  const ctx = sandbox(users, "mgr");
  assert.equal(ctx.projectEditLocked({ status: "measurement_done" }, users[1]), false);
  assert.equal(ctx.projectEditLocked({ status: "completed" }, users[1]), true);
  assert.equal(ctx.projectEditLocked({ status: "completed" }, users[0]), false);
});

test("request notifies the owner and approval unlocks for 24 hours", () => {
  const ctx = sandbox(users, "mgr");
  const order: any = { id: "o1", number: "R-1", status: "completed" };
  ctx.orders.push(order);
  ctx.projectEditRequest("o1");
  assert.equal(order.editRequests.length, 1);
  assert.equal(ctx.db.notifications[0].userId, "own");
  ctx.projectEditRequest("o1");
  assert.equal(order.editRequests.length, 1, "no duplicate pending request");

  ctx.state.currentUserId = "own";
  ctx.projectEditDecide("o1", order.editRequests[0].id, true);
  assert.equal(order.editRequests[0].status, "approved");
  assert.equal(ctx.projectEditLocked(order, users[1]), false);
  assert.equal(ctx.db.notifications.at(-1).userId, "mgr");
});

test("a manager cannot approve, and a declined request keeps the lock", () => {
  const ctx = sandbox(users, "mgr");
  const order: any = { id: "o2", status: "payment_received", editRequests: [{ id: "r", by: "mgr", status: "pending" }] };
  ctx.orders.push(order);
  ctx.projectEditDecide("o2", "r", true);
  assert.equal(order.editRequests[0].status, "pending");
  ctx.state.currentUserId = "own";
  ctx.projectEditDecide("o2", "r", false);
  assert.equal(ctx.projectEditLocked(order, users[1]), true);
});

test("the card hides editing for a locked manager and shows the edit button", () => {
  assert.match(html, /const canManage = orderUserCanManage\(u\) && !editLocked;/);
  assert.match(html, /return editBanner \+ projectCabinetHtml/);
  assert.match(cabinet, /onclick="projectEditStart\('\$\{oid\}'\)">✏️ Редактировать проект<\/button>/);
});

test("cancelling the prompt sends nothing", () => {
  const ctx = sandbox(users, "mgr");
  ctx.promptAnswer = null;
  const order: any = { id: "o3", status: "completed" };
  ctx.orders.push(order);
  ctx.projectEditRequest("o3");
  assert.equal(order.editRequests, undefined);
  assert.equal(ctx.db.notifications.length, 0);
});

test("every mutating handler of a locked project is guarded", () => {
  const ctx = sandbox(users, "mgr");
  ctx.promptAnswer = null;
  ctx.orders.push({ id: "o4", status: "payment_received" }, { id: "o5", status: "proposal_sent" });
  assert.equal(ctx.projectEditBlocked("o4"), true);
  assert.equal(ctx.projectEditBlocked("o5"), false);
  const stages = readFileSync(join(process.cwd(), "private/legacy/production-stages.js"), "utf8");
  for (const name of ["changeStatus", "openPaymentModal", "markDepositReceived", "kanbanMoveOrder", "orderKanbanAdvance", "openManagerMeasureModal", "openProjectEstimateWorkspace", "scheduleInstallationPrompt", "openServiceCashier", "projectSetServiceProgress"]) {
    assert.match(html, new RegExp(`function ${name}\\([^)]*\\) \\{\\n[^\\n]*projectEditBlocked\\(`), name);
  }
  assert.match(stages, /function openProjectInvoice\(oid\) \{\n[^\n]*projectEditBlocked\(oid\)/);
});
