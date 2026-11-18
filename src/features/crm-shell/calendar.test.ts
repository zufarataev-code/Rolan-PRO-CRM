import assert from "node:assert/strict";
import test from "node:test";

import { addDays, calendarDays, rangeLabel, shiftAnchor, weekStart } from "./calendar";

test("a week starts on Monday and has seven days", () => {
  assert.equal(weekStart("2026-11-18"), "2026-11-16");
  assert.equal(weekStart("2026-11-22"), "2026-11-16", "Sunday belongs to the week that began on Monday");
  assert.deepEqual(calendarDays("2026-11-18", "week"), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("a month is shown as whole weeks that cover it", () => {
  const days = calendarDays("2026-11-18", "month");
  assert.equal(days[0], "2026-10-26");
  assert.equal(days[days.length - 1], "2026-12-06");
  assert.equal(days.length % 7, 0);
  assert.ok(days.length <= 42);
});

test("moving back and forward, and the heading of the range", () => {
  assert.equal(shiftAnchor("2026-11-18", "week", 1), "2026-11-25");
  assert.equal(shiftAnchor("2026-01-31", "month", 1), "2026-02-01");
  assert.equal(shiftAnchor("2026-01-15", "month", -1), "2025-12-01");
  assert.equal(rangeLabel(calendarDays("2026-11-18", "week"), "2026-11-18", "week"), "16 – 22 ноября 2026 г.");
  assert.match(rangeLabel(calendarDays("2026-11-18", "month"), "2026-11-18", "month"), /ноябрь 2026/);
});
