import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function context(user: any, order: any) {
  const notices: any[] = [];
  const ctx: any = vm.createContext({
    state: { currentUserId: user.id },
    currentUser: () => user,
    getOrder: () => order,
    save: () => {},
    render: () => {},
    academyEsc: (value: string) => String(value),
    pushInAppNotification: (...args: any[]) => notices.push(args),
    notices,
  });
  vm.runInContext(stages.slice(stages.indexOf("function measureVisit(o)")), ctx);
  return ctx;
}

test("«Начал» stamps the visit, accepts the task and notifies the manager", () => {
  const order: any = { id: "o1", number: "R-1", status: "measurement_scheduled", measurerId: "m1", managerId: "mg1", timeline: [] };
  const ctx = context({ id: "m1", role: "measurer", name: "Alan" }, order);
  ctx.measureVisitStart("o1");
  assert.ok(order.measureVisit.startedAt);
  assert.ok(order.measurementAcceptedAt);
  assert.equal(order.timeline.at(-1).key, "measure_visit_started");
  assert.equal(ctx.notices.length, 1);
  const first = order.measureVisit.startedAt;
  ctx.measureVisitStart("o1");
  assert.equal(order.measureVisit.startedAt, first, "a second tap does not restart the clock");
});

test("«Закончил» records the time on site", () => {
  const order: any = { id: "o1", status: "measurement_scheduled", measurerId: "m1", timeline: [], measureVisit: { startedAt: new Date(Date.now() - 47 * 60000).toISOString() } };
  const ctx = context({ id: "m1", role: "measurer" }, order);
  ctx.measureVisitFinish(order);
  assert.ok(order.measureVisit.finishedAt);
  assert.ok(order.measureVisit.minutes >= 46 && order.measureVisit.minutes <= 48);
  assert.match(order.timeline.at(-1).note, /на объекте 4\d мин/);
  assert.equal(ctx.measureVisitDurationText(95), "1 ч 35 мин");
});

test("only the assigned measurer, a manager or the owner can start; not another measurer", () => {
  const order: any = { id: "o1", status: "measurement_scheduled", measurerId: "m1", timeline: [] };
  const ctx = context({ id: "m2", role: "measurer" }, order);
  ctx.measureVisitStart("o1");
  assert.equal(order.measureVisit, undefined);
  assert.equal(ctx.measureVisitBarHtml(order), "");
});

test("the visit buttons sit in the measurement footer and in the measurer's card", () => {
  assert.match(legacy, /measureVisitBarHtml\(o\)/);
  assert.match(legacy, /✓ Закончил — сдать замер/);
  assert.match(legacy, /title: 'Я на объекте — начал'/);
  assert.equal((legacy.match(/measureVisitFinish\(o\)/g) || []).length, 3, "every hand-in path stamps the end");
  assert.match(legacy, /measureVisitStartTicker\(oid\)/);
  assert.match(stages, /▶ Я на объекте — начал замер/);
});

test("a visit left open for 3+ hours is flagged to the measurer", () => {
  const order: any = { id: "o1", status: "measurement_scheduled", measurerId: "m1", timeline: [], measureVisit: { startedAt: new Date(Date.now() - 200 * 60000).toISOString() } };
  const ctx = context({ id: "m1", role: "measurer" }, order);
  assert.match(ctx.measureVisitBarHtml(order), /если уехали, нажмите «Закончил»/);
});
