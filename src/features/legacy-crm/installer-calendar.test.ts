import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-27: installers saw «Электромонтажа 300 · день 1» and one visit four times.
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const from = stages.indexOf("function calendarServiceName(");
const to = stages.indexOf("function calendarEventsForOrder(o, type) {");
const load = (role: string) => {
  const ctx: Record<string, any> = { currentUser: () => ({ role }) };
  vm.createContext(ctx);
  vm.runInContext(stages.slice(from, to), ctx);
  return ctx;
};

test("a price typed into a service name is hidden from installers, kept for the owner", () => {
  assert.equal(load("installer").calendarServiceName("Электромонтжа  300"), "Электромонтжа");
  assert.equal(load("installer").calendarServiceName("Smart 95"), "Smart");
  assert.equal(load("installer").calendarServiceName("Solar SP-35%"), "Solar SP-35%");
  assert.equal(load("installer").calendarServiceName("$300"), "Работы по проекту");
  assert.equal(load("owner").calendarServiceName("Электромонтжа  300"), "Электромонтжа  300");
});

test("services of one project at the same time with the same crew are one card", () => {
  const ctx = load("installer");
  const at = new Date("2026-11-12T16:00:00Z");
  const ev = (name: string, crew: string[], dt = at) => ({ dt, o: { installerIds: crew }, note: name, service: { name, kind: "film", day: 1, days: 1 } });
  const merged = ctx.calendarMergeSameVisit([ev("Solar", ["a", "b"]), ev("Smart", ["b", "a"]), ev("Solar", ["a", "b"]), ev("Solar", ["c"])]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].service.name, "Solar · Smart");
  assert.equal(ctx.calendarMergeSameVisit([ev("A", ["a"]), ev("B", ["a"], new Date("2026-11-13T16:00:00Z"))]).length, 2);
});
