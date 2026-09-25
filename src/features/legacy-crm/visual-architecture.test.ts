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
    "Монтажники сейчас",
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
