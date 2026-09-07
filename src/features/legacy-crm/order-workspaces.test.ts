import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("order operations open in focused workspaces instead of inline accordions", () => {
  const start = html.indexOf("function renderOrderCleanDetails");
  const end = html.indexOf("function renderInstallerTechnicalWorkspace", start);
  const cleanOrder = html.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(html, /function renderOrderWorkspaceTile/);
  assert.match(html, /function openOrderWorkspaceFromTemplate/);
  assert.match(cleanOrder, /class="order-workspace-grid"/);
  assert.doesNotMatch(cleanOrder, /renderOrderCleanCard\(/);

  for (const title of [
    "Клиент и связь",
    "Замер",
    "КП и документы",
    "Календарь и команда",
    "Оплата",
    "Маршрут заказа",
    "Файлы и история",
  ]) {
    assert.ok(cleanOrder.includes(title), `missing workspace: ${title}`);
  }
});

test("order workspace dialog keeps the order context and a clear close action", () => {
  assert.match(html, /order-workspace-modal-kicker[\s\S]*?order\?\.number/);
  assert.match(html, /aria-label="Закрыть рабочее окно"/);
  assert.match(html, /if\(event\.target===this\) closeModal\(\)/);
  assert.match(html, /@media \(max-width: 1000px\)[\s\S]*?order-workspace-grid[\s\S]*?grid-template-columns: 1fr/);
});
