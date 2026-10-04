import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("wide owner kanban shows all seven stages without horizontal clipping", () => {
  assert.match(
    source,
    /@media \(min-width: 1800px\)[\s\S]*?\.kanban-funnel \{[\s\S]*?grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)[\s\S]*?overflow-x: hidden/,
  );
  assert.match(source, /\.kanban-column \{[\s\S]*?min-width: 0/);
});

test("narrow kanban remains a deliberate one-stage horizontal scroller", () => {
  assert.match(
    source,
    /@media \(max-width: 768px\)[\s\S]*?\.kanban-funnel \{[\s\S]*?grid-template-columns: none[\s\S]*?grid-auto-columns: min\(86vw, 300px\)[\s\S]*?overflow-x: auto/,
  );
});

test("shared form fields and dialogs cannot force their workspace wider", () => {
  assert.match(source, /input, select, textarea \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(source, /\.modal-content \{[\s\S]*?min-width: 0;/);
  assert.match(
    source,
    /@media \(max-width: 768px\)[\s\S]*?\.modal-content \{[\s\S]*?width: 100%/,
  );
});

test("owner shell keeps every primary operational section in one navigation", () => {
  const labels = [
    "Главная",
    "Новые лиды",
    "Холодные звонки",
    "Проекты",
    "КП",
    "Услуги и цены",
    "Календарь",
    "Специалисты по установке сейчас",
    "Задачи",
    "Академия",
    "Клиенты",
    "Склад",
    "Зарплата",
    "Ожидают оплаты",
    "Деньги",
    "Отчёты",
    "Команда",
    "Реферальная программа",
    "Отзывы",
    "Настройки",
  ];

  labels.forEach((label) => assert.ok(source.includes(label), `missing owner surface: ${label}`));
});

test("business home keeps the action workbench accessible", () => {
  assert.match(source, /function renderPrecisionManagerDashboard\(\)/);
  assert.match(source, /Что требует внимания сегодня/);
  assert.match(source, /Очередь действий/);
  assert.match(source, /Следующий шаг/);
  assert.match(source, /Исключения/);
  assert.match(source, /Монтажи в работе/);
  assert.match(source, /function renderManagerDashboard\(\) \{\s*return renderPulseBusinessDashboard\(\);/);
});

test("manager workbench exposes the complete eight-stage operating funnel", () => {
  const dashboard = source.match(
    /function renderPrecisionManagerDashboard\(\) \{([\s\S]*?)\n\}\n\nfunction pulsePeriodRange/,
  )?.[1];

  assert.ok(dashboard);
  ["Новые", "Консультация", "Замер", "КП", "Подготовка", "Монтаж", "Оплата", "Закрыто"]
    .forEach((stage) => assert.ok(dashboard.includes(`label: '${stage}'`), `missing stage: ${stage}`));
});

test("precision workbench remains usable on phone and tablet", () => {
  assert.match(source, /\.pw-workgrid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 340px\)/);
  assert.match(source, /@media \(max-width: 840px\) \{[\s\S]*?\.pw-workgrid \{ grid-template-columns: 1fr; \}/);
  assert.match(source, /@media \(max-width: 640px\) \{[\s\S]*?\.pw-action-row \{ grid-template-columns: 4px minmax\(0, 1fr\)/);
  assert.match(source, /padding: \.72rem \.7rem calc\(5\.6rem \+ env\(safe-area-inset-bottom\)\)/);
});

test("precision workbench checks the correct assignee for measurement and installation", () => {
  assert.match(
    source,
    /o\.status === 'measurement_scheduled' && !o\.measurerId/,
  );
  assert.match(
    source,
    /o\.status === 'installation_scheduled' && !\(o\.installerIds \|\| \[\]\)\.length/,
  );
});
