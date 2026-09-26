import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("mobile calendar renders compact month structure", () => {
  assert.match(source, /function renderDispatchMonthMobile\(anchor\)/);
});

test("selected day agenda exists in mobile view", () => {
  assert.match(source, /function renderDispatchDayMobile\(anchor\)/);
});

test("mobile week uses compact selector and agenda", () => {
  assert.match(source, /function renderDispatchWeekMobile\(anchor\)/);
});

test("mobile map is collapsed by default", () => {
  assert.match(source, /class="dispatch-map-canvas-collapsed"/);
});
