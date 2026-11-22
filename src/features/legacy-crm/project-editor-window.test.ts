import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-22 09:45: «Редактировать проект» opens a normal window where the
// services can be added, removed and changed — also on a closed project for the owner.
const cabinet = readFileSync(join(process.cwd(), "private/legacy/project-cabinet.js"), "utf8");
const html = readFileSync(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");

function sandbox(role: string, order: any) {
  const user = { id: "u", role, name: "U" };
  const ctx: any = {
    state: { currentUserId: "u" }, db: { users: [user], notifications: [] }, saved: 0, marks: [] as string[],
    CLOSED_PROJECT_STATUSES: ["installation_done", "act_signed", "payment_received", "completed", "review_received"],
  };
  Object.assign(ctx, {
    getOrder: (id: string) => (id === order.id ? order : null),
    getClient: () => ({ id: "c", name: "Robert" }),
    getUser: (id: string) => (id === "u" ? user : null),
    currentUser: () => user,
    orderUserCanSeeMoney: () => true,
    projectLines: (o: any) => o.lines,
    projectServiceProgress: (o: any, key: string) => o.serviceProgress?.[key] || { status: "planned" },
    projectApplyLineUnitPrice: (line: any, price: number) => { line.sources[0].price = price; return true; },
    projectEstimateSyncQuickServices: () => {}, syncProjectIncludedServices: () => {}, projectPrunePlans: () => {}, projectCardSyncCrew: () => {},
    projectEstimateMarkChanged: (_o: any, reason: string) => ctx.marks.push(reason),
    save: () => { ctx.saved += 1; }, render: () => {}, preservePositionForNextRender: () => {},
    confirm: () => true, alert: () => {}, prompt: () => null,
    jsQuote: (v: string) => v, academyEsc: (v: string) => String(v), fmtMoney: (v: number) => `$${v}`,
    orderAddress: () => "", orderRevenue: (o: any) => o.lines.reduce((s: number, l: any) => s + l.price, 0),
    orderPaidTotal: () => 0, projectLineQtyText: () => "", serviceOffering: () => null, projectServicePriceRange: () => null,
    measureAllWindows: () => [], windowActualAreaSqft: () => 0, uid: () => "x",
  });
  vm.createContext(ctx);
  vm.runInContext(cabinet, ctx);
  return ctx;
}

function order(status: string) {
  const src = { id: "s1", qty: 2, unitPrice: 50, price: 100 };
  return { id: "o1", number: "R-1", status, extraServices: [src], lines: [{ key: "k1", kind: "quantity", name: "Силикон", qty: 2, price: 100, sources: [src] }] };
}

test("owner edits quantity, price and removes a service on a closed project", () => {
  const o: any = order("review_received");
  const ctx = sandbox("owner", o);
  assert.equal(ctx.projectEditorCanEdit(o), true);
  ctx.projectEditorSetQty("o1", "k1", "3");
  assert.equal(o.extraServices[0].price, 150, "sum follows quantity at the unit price");
  ctx.projectEditorSetPrice("o1", "k1", "200");
  assert.equal(ctx.marks.length, 2);
  ctx.projectEditorRemove("o1", "k1");
  assert.equal(o.extraServices.length, 0);
  assert.match(ctx.state.modal, /Редактировать проект R-1/);
});

test("a manager cannot edit a closed project without the owner's approval", () => {
  const o: any = order("completed");
  const ctx = sandbox("manager", o);
  assert.equal(ctx.projectEditorCanEdit(o), false);
  ctx.projectEditorSetQty("o1", "k1", "9");
  assert.equal(o.extraServices[0].qty, 2);
  const open: any = order("proposal_sent");
  assert.equal(sandbox("manager", open).projectEditorCanEdit(open), true);
});

test("the edit button opens the window, and the cashier returns to it", () => {
  assert.match(cabinet, /function projectEditStart\(oid\) \{[\s\S]*?openProjectEditor\(oid\);/);
  assert.match(cabinet, /openServiceCashier\('\$\{oid\}','editor'\)/);
  assert.match(html, /\['estimate', 'intake', 'direction', 'editor'\]\.includes\(returnTo\)/);
  assert.match(html, /returnTo === 'editor' && typeof openProjectEditor === 'function'\) openProjectEditor\(oid\)/);
});

test("a manager cannot delete a completed service; the owner can", () => {
  const o: any = order("installation_in_progress");
  o.serviceProgress = { k1: { status: "done" } };
  const mgr = sandbox("manager", o);
  mgr.projectEditorRemove("o1", "k1");
  assert.equal(o.extraServices.length, 1);
  sandbox("owner", o).projectEditorRemove("o1", "k1");
  assert.equal(o.extraServices.length, 0);
});

test("manager price stays inside the corridor; sized services return to the window", () => {
  const o: any = order("proposal_sent");
  const ctx = sandbox("manager", o);
  ctx.serviceOffering = () => ({ name: "Силикон" });
  ctx.projectServicePriceRange = () => ({ min: 10, max: 60 });
  ctx.projectEditorSetPrice("o1", "k1", "200"); // 100 per unit > max
  assert.equal(o.extraServices[0].price, 100);
  const stages = readFileSync(join(process.cwd(), "private/legacy/production-stages.js"), "utf8");
  assert.match(stages, /returnTo === 'editor' && typeof openProjectEditor === 'function'\) openProjectEditor\(oid\);/);
});
