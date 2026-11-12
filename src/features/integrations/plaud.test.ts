import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { PlaudError, matchPlaudRecording, normalizePlaudPayload, plaudTokenMatches } from "./plaud-core";

const NOW = new Date("2026-11-12T20:00:00Z");
const SECRET = "s".repeat(32);

test("token: Bearer or raw header, short secrets never accepted", () => {
  assert.equal(plaudTokenMatches(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(plaudTokenMatches(SECRET, SECRET), true);
  assert.equal(plaudTokenMatches("Bearer wrong", SECRET), false);
  assert.equal(plaudTokenMatches(null, SECRET), false);
  assert.equal(plaudTokenMatches("short", "short"), false);
});

test("payload: accepts common Zapier field names, rejects empty recordings", () => {
  const rec = normalizePlaudPayload({ name: "R-261112-005 Иванов", transcription: "Окно 36 на 60", start_time: "1762977600", duration: "1260" }, NOW);
  assert.equal(rec.title, "R-261112-005 Иванов");
  assert.equal(rec.transcript, "Окно 36 на 60");
  assert.equal(rec.recorded_at, new Date(1762977600 * 1000).toISOString());
  assert.equal(rec.duration_sec, 1260);
  assert.match(rec.recording_key, /^sha256:/);
  assert.equal(normalizePlaudPayload({ id: "abc-1", summary: "x" }, NOW).recording_key, "abc-1");
  assert.throws(() => normalizePlaudPayload({ title: "пусто" }, NOW), PlaudError);
});

const payload = { clients: [{ id: "c1", phone: "(818) 555-0101" }, { id: "c2", phone: "+1 310 555 0202" }] };
const orders = [
  { id: "o1", number: "R-261112-005", clientId: "c1", status: "measurement_scheduled" },
  { id: "o2", number: "R-261112-006", clientId: "c2", status: "measurement_scheduled", measureVisit: { startedAt: "2026-11-12T18:00:00Z", finishedAt: "2026-11-12T19:10:00Z" } },
  { id: "o3", number: "R-261101-001", clientId: "c2", status: "completed" },
];

test("match by project number in the title", () => {
  const rec = normalizePlaudPayload({ title: "Замер r-261112-005", summary: "x" }, NOW);
  assert.deepEqual(matchPlaudRecording(rec, payload, orders), { order_id: "o1", order_number: "R-261112-005", reason: "order_number" });
});

test("match by client phone, ignoring closed projects", () => {
  const rec = normalizePlaudPayload({ title: "Клиент 310-555-0202", summary: "x" }, NOW);
  assert.equal(matchPlaudRecording(rec, payload, orders)?.order_id, "o2");
});

test("match by the measurer's «Начал» visit, never guessing between two", () => {
  const rec = normalizePlaudPayload({ title: "Запись", summary: "x", recorded_at: "2026-11-12T18:20:00Z" }, NOW);
  assert.deepEqual(matchPlaudRecording(rec, payload, orders), { order_id: "o2", order_number: "R-261112-006", reason: "measure_visit" });
  const two = [...orders, { id: "o4", number: "R-4", clientId: "x", measureVisit: { startedAt: "2026-11-12T18:05:00Z" } }];
  assert.equal(matchPlaudRecording(rec, payload, two), null);
  const late = normalizePlaudPayload({ title: "Запись", summary: "x", recorded_at: "2026-11-12T23:00:00Z" }, NOW);
  assert.equal(matchPlaudRecording(late, payload, orders), null);
});

const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function legacyContext() {
  let n = 0;
  const ctx: any = vm.createContext({
    state: { currentUserId: "m1" },
    uid: () => "id" + ++n,
    inches_to_mm: (inch: number) => inch * 25.4,
    managerWindowDefaults: () => ({ id: "w" + ++n, name: "Окно", width: 1016, height: 1778, sizePlaceholder: { width: true, height: true }, qty: 1 }),
    invalidateProjectEstimate: () => {},
    academyEsc: (value: string) => String(value),
  });
  vm.runInContext(stages.slice(stages.indexOf("function plaudState()")), ctx);
  return ctx;
}

test("AI plan: invented or broken sizes are dropped, wishes and sizes land in the project", () => {
  const ctx = legacyContext();
  const plan = ctx.plaudParsePlan(`Вот: {"client_wishes":["жара в спальне"],"budget":"до $2000","timing":"","notes":"","rooms":[
    {"name":"Спальня","windows":[{"name":"Окно у кровати","width_in":36,"height_in":60,"qty":2},{"name":"без высоты","width_in":30}]},
    {"name":"Кухня","windows":[{"width_in":"9999","height_in":40}]}]}`);
  assert.equal(JSON.stringify(plan.rooms.map((r: any) => r.windows.length)), "[1]");
  const order: any = { id: "o1", notes: "Старое", measurements: { rooms: [{ id: "r1", name: "спальня", windows: [] }] } };
  const result = ctx.plaudApplyPlan(order, plan, "R-1");
  assert.equal(result.windows, 1);
  assert.equal(result.rooms, 0, "an existing room is reused by name");
  const win = order.measurements.rooms[0].windows[0];
  assert.equal(win.width, Math.round(36 * 25.4));
  assert.equal(win.qty, 2);
  assert.equal(win.sizePlaceholder.width, false);
  assert.match(win.internalNotes, /сверить/);
  assert.match(order.notes, /Старое\n🎙 Plaud: Пожелания: жара в спальне · Бюджет: до \$2000/);
  assert.equal(order.timeline.at(-1).key, "plaud_applied");
  assert.equal(ctx.plaudParsePlan("не JSON"), null);
});

test("the dictaphone block lives in the measurement window", () => {
  assert.match(legacy, /plaudMeasureBlockHtml\(o\)/);
});
