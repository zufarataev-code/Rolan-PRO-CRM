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
  // One button: accept, start or continue — the same step as on the card.
  assert.match(dashboard, /const nextAction = nextTask \? measurerOrderPrimaryAction\(nextTask\) : null;/);
  assert.match(dashboard, /onclick="\$\{nextAction\.onclick\}"/);
  assert.match(dashboard, /localDateKey\(o\.measurementAt\) === todayKey/, 'today in local time');
  assert.match(dashboard, /Сдано за месяц/);
  assert.match(legacy, /acceptMeasurementTask\('\$\{o\.id\}', true\)/);
  assert.match(legacy, /title: measureAllWindows\(o\)\.length \? 'Продолжить замер' : 'Начать замер'/);
  assert.match(dashboard, /selectAppView\('calendar'\)/);
  assert.match(dashboard, /selectAppView\('measurements'\)/);
});

test("surveyor task cards keep the existing operational actions", () => {
  const tasks = legacy.slice(
    legacy.indexOf("function renderMeasurerList(tasks)"),
    legacy.indexOf("// ---------- INSTALLER VIEWS ----------"),
  );

  // Accept / start / continue come from measurerOrderPrimaryAction; «Завершить
  // замер» moved into the measurement, where missing items are shown in place.
  assert.match(tasks, /const action = measurerOrderPrimaryAction\(o\);/);
  assert.match(tasks, /openOrder\('\$\{o\.id\}'\)/);
  assert.match(tasks, /startCall/);
  assert.match(tasks, /whatsappLink/);
  assert.match(tasks, /sq ft/);
  assert.doesNotMatch(tasks, /T\('m2'\)/);
  assert.match(legacy, /function measureStudioFinish\(orderId\)/);
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
