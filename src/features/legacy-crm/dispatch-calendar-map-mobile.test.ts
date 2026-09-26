import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("mobile calendar has a dedicated viewport branch", () => {
  assert.match(source, /function isMobileCalendarViewport\(\)/);
  assert.match(source, /if \(isMobileCalendar\)/);
});

test("mobile month renders a compact seven-column grid and selected-day agenda", () => {
  assert.match(source, /function renderDispatchMonthMobile\(anchor\)/);
  assert.match(source, /class="mobile-calendar-month-grid"/);
  assert.match(source, /grid-template-columns:\s*repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(source, /renderMobileCalendarAgenda\(selected\)/);
});

test("mobile week uses a seven-day selector plus selected-day agenda", () => {
  assert.match(source, /function renderDispatchWeekMobile\(anchor\)/);
  assert.match(source, /class="mobile-calendar-week-strip"/);
  assert.match(source, /renderMobileCalendarAgenda\(selected\)/);
});

test("mobile day is chronological agenda without the desktop hour grid", () => {
  const match = source.match(/function renderDispatchDayMobile\(anchor\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(match, /renderMobileCalendarAgenda\(day\)/);
  assert.doesNotMatch(match, /dispatch-time-grid|DISPATCH_HOUR_HEIGHT/);
});

test("mobile map is opt-in through calendarShowMap", () => {
  assert.match(source, /calendar-mobile-map-toggle/);
  assert.match(source, /state\.calendarShowMap=!state\.calendarShowMap/);
  assert.match(source, /const mobileMap = state\.calendarShowMap/);
});

test("desktop dispatch functions remain present and unchanged as separate paths", () => {
  assert.match(source, /function renderDispatchWeek\(anchor\)/);
  assert.match(source, /function renderDispatchDay\(anchor\)/);
  assert.match(source, /return toolbar \+ `<div class="dispatch-workspace">\$\{renderDispatchWeek\(anchor\)\}/);
  assert.match(source, /return toolbar \+ `<div class="dispatch-workspace">\$\{renderDispatchDay\(anchor\)\}/);
});

test("Messenger consultations still open through the canonical consultation card", () => {
  assert.match(source, /openCanonicalConsultationCard\('\$\{order\._canonicalConsultationId\}'\)/);
  assert.match(source, /Запись из Messenger/);
});

test("iPhone safe area and no-overflow mobile controls are explicitly styled", () => {
  assert.match(source, /padding-top:\s*max\(\.65rem, env\(safe-area-inset-top\)\)/);
  assert.match(source, /\.calendar-mobile-filters[\s\S]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
});
