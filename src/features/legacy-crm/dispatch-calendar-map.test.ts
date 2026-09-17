import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const routeSource = readFileSync("app/legacy-crm/route.ts", "utf8");

test("weekly calendar is one side-by-side schedule and map workspace", () => {
  assert.match(source, /class="dispatch-workspace"/);
  assert.match(source, /renderDispatchWeek\(anchor\).*renderDispatchMap\(anchor, 'week'\)/);
  assert.match(source, /class="dispatch-week-head"/);
  assert.match(source, /class="dispatch-map-canvas"/);
  assert.match(source, /DISPATCH_START_HOUR = 6/);
  assert.match(source, /DISPATCH_END_HOUR = 21/);
  assert.match(source, /openCalendarSchedulePicker\(\)/);
  assert.match(source, /confirmCalendarSchedulePicker\(\)/);
});

test("day calendar uses one timeline and map instead of duplicate KPI and event lanes", () => {
  assert.match(source, /function renderDispatchDay\(anchor\)/);
  assert.match(source, /calendar-toolbar-primary/);
  assert.match(source, /calendar-toolbar-secondary/);
  assert.match(source, /renderDispatchDay\(anchor\).*renderDispatchMap\(anchor, 'day'\)/s);
  assert.match(source, /mode === 'month' && state\.calendarShowMap/);
});

test("calendar and map share project events and filters", () => {
  assert.match(source, /function calendarAssigneeFilterValue\(\)/);
  assert.match(source, /calendarEventAssigneeIds\(o, eventType\)/);
  assert.match(source, /state\.calendarAssigneeFilter=this\.value; render\(\)/);
  assert.match(source, /scheduledOnly:true/);
  assert.match(source, /const eventKey = `\$\{it\.o\.id\}:\$\{it\.kind\}:\$\{it\.dt \? it\.dt\.toISOString\(\) : 'pending'\}`/);
});

test("dispatch events expose operational identity and timed map labels", () => {
  assert.match(source, /calendarEventPeople\(ev\).*c\?\.name/s);
  assert.match(source, /orderAddress\(o, c\) \|\| 'Адрес не указан'/);
  assert.match(source, /bindTooltip\(calendarTimeLabel\(it\.dt\).*permanent:true/);
  assert.match(source, /onclick="openOrder\('\$\{o\.id\}'\)"/);
});

test("dispatch calendar uses the server-configured Google map with a safe fallback", () => {
  assert.match(source, /window\.__ROLANPRO_GOOGLE_MAPS_API_KEY__/);
  assert.match(source, /function loadGoogleMapsLibrary\(\)/);
  assert.match(source, /new google\.maps\.Map\(el/);
  assert.match(source, /new google\.maps\.Marker\(/);
  assert.match(source, /Google Maps · адресов:/);
  assert.match(source, /_mapProvider = 'leaflet'/);
  assert.match(routeSource, /window\.__ROLANPRO_GOOGLE_MAPS_API_KEY__/);
  assert.match(routeSource, /strict-origin-when-cross-origin/);
});
