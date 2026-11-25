import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-23: arrows move the payroll period back and forward by its own length.
const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const from = html.indexOf("function payrollShiftedRange(");
const ctx: Record<string, any> = { state: {}, render: () => {} };
vm.createContext(ctx);
vm.runInContext(html.slice(from, html.indexOf("function renderPayroll() {")), ctx);
const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test("a week moves by seven days, a day by one", () => {
  const { start, end } = ctx.payrollShiftedRange("this_week", new Date(2026, 10, 23), new Date(2026, 10, 29, 23, 59), -1);
  assert.deepEqual([day(start), day(end)], ["2026-11-16", "2026-11-22"]);
  const next = ctx.payrollShiftedRange("today", new Date(2026, 10, 23), new Date(2026, 10, 23, 23, 59), 1);
  assert.deepEqual([day(next.start), day(next.end)], ["2026-11-24", "2026-11-24"]);
});

test("a month moves to the whole previous or next month", () => {
  const { start, end } = ctx.payrollShiftedRange("this_month", new Date(2026, 10, 1), new Date(2026, 10, 30, 23, 59), -9);
  assert.deepEqual([day(start), day(end)], ["2026-2-1", "2026-2-28"]);
});

test("a custom span moves by its own length; the arrows and reset are on the screen", () => {
  const { start, end } = ctx.payrollShiftedRange("custom", new Date(2026, 10, 1), new Date(2026, 10, 10, 23, 59), 1);
  assert.deepEqual([day(start), day(end)], ["2026-11-11", "2026-11-20"]);
  ctx.payrollShiftPeriod(-1); ctx.payrollShiftPeriod(-1);
  assert.equal(ctx.state.payrollShift, -2);
  assert.match(html, /onclick="payrollShiftPeriod\(-1\)">◀<\/button>/);
  assert.match(html, /onclick="payrollShiftPeriod\(1\)">▶<\/button>/);
  assert.match(html, /state\.payrollPeriod=this\.value; state\.payrollShift=0;/);
});
