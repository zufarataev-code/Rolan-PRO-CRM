import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { enforceProjectArchive } from "./project-archive";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

type Order = { id: string; number: string; clientId: string; timeline?: unknown[]; archive?: { cancelledRequestIds?: string[]; reason?: string } };

function load(role = "owner") {
  const start = html.indexOf("// ---------- АРХИВ ПРОЕКТОВ");
  const end = html.indexOf("function renderOrders() {", start);
  assert.ok(start > 0 && end > start, "archive block not found");
  const db = {
    orders: [{ id: "o1", number: "R-1", clientId: "c1" }, { id: "o2", number: "R-2", clientId: "c1" }] as Order[],
    purchaseRequests: [
      { id: "pr1", orderId: "o1", status: "draft", note: "плёнка" },
      { id: "pr2", orderId: "o1", status: "ordered", note: "" },
      { id: "pr3", orderId: "o2", status: "draft", note: "" },
    ] as Array<Record<string, unknown>>,
  } as { orders: Order[]; purchaseRequests: Array<Record<string, unknown>>; archivedOrders?: Order[] };
  const state: Record<string, unknown> = { currentUserId: "u1", view: "orderDetails", openOrderId: "o1" };
  const alerts: string[] = [];
  const opened: string[] = [];
  const fields: Record<string, string> = { "arch-reason": "дубль" };
  const context = vm.createContext({
    db, state,
    location: { hash: "#/order/o1" },
    document: { getElementById: (id: string) => (id in fields ? { value: fields[id] } : null) },
    currentUser: () => ({ id: "u1", role }),
    getOrder: (id: string) => db.orders.find((o) => o.id === id),
    getClient: () => ({ name: "Client" }),
    getUser: () => ({ name: "Зуфар" }),
    orderRevenue: () => 5000,
    fmtMoney: (v: number) => `$${v}`,
    fmtDateTime: (v: string) => v,
    academyEsc: (v: string) => String(v),
    save: () => undefined,
    render: () => undefined,
    openOrder: (id: string) => opened.push(id),
    cloudStatus: () => undefined,
    alert: (message: string) => alerts.push(message),
  });
  vm.runInContext(`${html.slice(start, end)}; Object.assign(this, { archiveProject, restoreProject, projectNumberSequence, openArchiveProjectModal, openProjectArchive });`, context);
  return { crm: context as unknown as { archiveProject: (id: string) => void; restoreProject: (id: string) => void; projectNumberSequence: () => number; openArchiveProjectModal: (id: string) => void; openProjectArchive: () => void }, db, state, alerts, opened };
}

test("the owner deletes a project into the archive and restores it with all its data", () => {
  const { crm, db, state, opened } = load();
  crm.archiveProject("o1");
  assert.deepEqual(db.orders.map((o) => o.id), ["o2"], "gone from the working list");
  assert.equal(db.archivedOrders?.[0].id, "o1");
  assert.equal(db.archivedOrders?.[0].archive?.reason, "дубль");
  assert.equal(db.purchaseRequests[0].status, "cancelled", "its draft purchase is not sent");
  assert.equal(db.purchaseRequests[1].status, "ordered", "an order already placed stays with purchasing");
  assert.equal(db.purchaseRequests[2].status, "draft", "other projects are untouched");
  assert.equal(state.view, "orders", "the open card closes");
  assert.equal(crm.projectNumberSequence(), 3, "archived projects keep their numbers");

  crm.restoreProject("o1");
  assert.deepEqual(db.orders.map((o) => o.id).sort(), ["o1", "o2"]);
  assert.equal(db.archivedOrders?.length, 0);
  assert.equal(db.orders.find((o) => o.id === "o1")?.archive, undefined);
  assert.equal(db.purchaseRequests[0].status, "draft", "the draft purchase is back");
  assert.equal(db.purchaseRequests[0].note, "плёнка");
  assert.deepEqual(opened, ["o1"]);
});

test("only the owner can delete or restore projects", () => {
  const { crm, db, alerts } = load("manager");
  crm.archiveProject("o1");
  crm.openArchiveProjectModal("o1");
  crm.openProjectArchive();
  assert.equal(db.orders.length, 2);
  assert.equal(alerts.length, 3);
  assert.match(alerts[0], /только владелец/);
  assert.match(html, /\$\{u\?\.role === 'owner' \? `<button class="btn-ghost text-sm text-red-600" onclick="openArchiveProjectModal/);
  assert.match(html, /currentUser\(\)\?\.role === 'owner' \? `<button class="btn-ghost" onclick="openProjectArchive\(\)">🗄 Архив/);
  assert.equal(html.match(/String\(projectNumberSequence\(\)\)\.padStart\(3, '0'\)/g)?.length, 2);
});

test("the server keeps the archive: owner decides, a stale or non-owner save cannot undo it", () => {
  const current = { orders: [{ id: "o2" }, { id: "o3" }], archivedOrders: [{ id: "o1" }] };

  // The owner's stale second browser still has o1 in the list: the archive wins.
  const owner = enforceProjectArchive(current, { orders: [{ id: "o1" }, { id: "o2" }, { id: "o3" }], archivedOrders: [{ id: "o1" }] }, true);
  assert.deepEqual(owner.orders.map((o) => (o as { id: string }).id), ["o2", "o3"]);

  // The owner restores o1.
  const restored = enforceProjectArchive(current, { orders: [{ id: "o2" }, { id: "o3" }, { id: "o1" }], archivedOrders: [] }, true);
  assert.equal(restored.orders.length, 3);
  assert.deepEqual(restored.archivedOrders, []);

  // A manager cannot drop o3, restore o1 or touch the archive.
  const manager = enforceProjectArchive(current, { orders: [{ id: "o1" }, { id: "o2" }], archivedOrders: [] }, false);
  assert.deepEqual(manager.orders.map((o) => (o as { id: string }).id), ["o2", "o3"]);
  assert.deepEqual(manager.archivedOrders, [{ id: "o1" }]);

  assert.match(readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8"), /enforceProjectArchive\(\n\s*currentWorkspace\.payload as Record<string, unknown>,\n\s*payload as Record<string, unknown>,\n\s*auth\.session\.roles\.includes\(ROLE_CODES\.OWNER\),/);
});
