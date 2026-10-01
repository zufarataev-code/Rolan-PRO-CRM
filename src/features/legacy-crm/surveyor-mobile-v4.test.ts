import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("surveyor mobile dock exposes today, calendar, personal tasks and measurements", () => {
  const mobileNav = legacy.slice(
    legacy.indexOf("const mobileNavItems ="),
    legacy.indexOf("const compactViewport ="),
  );

  assert.match(
    mobileNav,
    /role === 'measurer'[\s\S]*?\['dashboard', 'Сегодня'[\s\S]*?\['calendar', 'Календарь'[\s\S]*?\['tasks', 'Мои задачи'[\s\S]*?\['measurements', 'Замеры'/,
  );
  assert.match(legacy, /onclick="toggleSidebar\(\)" aria-label="Открыть все разделы"/);
});

test("surveyor today view uses assigned work and resumes the canonical measurement", () => {
  const dashboard = legacy.slice(
    legacy.indexOf("function renderMeasurerDashboard()"),
    legacy.indexOf("function renderMeasurerTasks()"),
  );

  assert.match(dashboard, /field-day-hero/);
  assert.match(dashboard, /o\.measurerId === u\.id/);
  assert.match(dashboard, /openMeasurerV25ForOrder\('\$\{nextTask\.id\}'\)/);
  assert.match(dashboard, /selectAppView\('calendar'\)/);
  assert.match(dashboard, /selectAppView\('measurements'\)/);
});

test("surveyor task cards keep the existing operational actions", () => {
  const tasks = legacy.slice(
    legacy.indexOf("function renderMeasurerList(tasks)"),
    legacy.indexOf("// ---------- INSTALLER VIEWS ----------"),
  );

  assert.match(tasks, /acceptMeasurementTask/);
  assert.match(tasks, /openMeasurerV25ForOrder/);
  assert.match(tasks, /startCall/);
  assert.match(tasks, /whatsappLink/);
  assert.match(tasks, /changeStatus/);
});

test("field calendar offers a phone schedule and map without a second data source", () => {
  const calendar = legacy.slice(
    legacy.indexOf("function renderCalendar()"),
    legacy.indexOf("// ============================================================================\n// PAYROLL"),
  );

  assert.match(calendar, /fieldMobileCalendar/);
  assert.match(calendar, /field-calendar-toggle/);
  assert.match(calendar, /Расписание/);
  assert.match(calendar, /Карта и маршрут/);
  assert.match(calendar, /renderDispatchDay\(anchor\)/);
  assert.match(calendar, /renderDispatchWeek\(anchor\)/);
  assert.doesNotMatch(calendar, /fetch\(/);
});

test("personal tasks remain the canonical shared task module", () => {
  const taskView = legacy.slice(
    legacy.indexOf("function renderTasksView()"),
    legacy.indexOf("function addTask()"),
  );

  assert.match(taskView, /field-task-center/);
  assert.match(taskView, /Мои задачи/);
  assert.match(taskView, /toggleTaskDone/);
  assert.match(taskView, /field-task-compose/);
});
