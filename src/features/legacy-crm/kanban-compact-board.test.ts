import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Owner, 2026-11-22: all project cards fit one window, a period filter
// (day / week / month) sits right above the board, and the board opens full screen.
const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("compact cards are the default and the choice is remembered", () => {
  assert.match(html, /function ordersKanbanDensity\(\)/);
  assert.match(html, /localStorage\.getItem\('rp\.ordersKanbanDensity'\) === 'detailed' \? 'detailed' : 'compact'/);
  assert.match(html, /class="kanban-funnel \$\{ordersKanbanDensity\(\) === 'compact' \? 'is-compact' : ''\}"/);
});

test("compact board shows all seven stages side by side", () => {
  assert.match(html, /\.kanban-funnel\.is-compact \{\s*grid-auto-flow: row;\s*grid-template-columns: repeat\(7, minmax\(158px, 1fr\)\);/);
  assert.match(html, /\.kanban-funnel\.is-compact \.kanban-card-details,/);
  assert.match(html, /class="kanban-compact-line"/);
});

test("the board toolbar carries the period filter, density and full screen", () => {
  assert.match(html, /function renderOrdersKanbanToolbar\(fullscreen = false\)/);
  assert.match(html, /renderOrdersKanbanToolbar\(false\) \+ renderOrdersKanban\(filtered/);
  assert.match(html, /\$\{renderOrdersKanbanToolbar\(true\)\}/);
  const toolbar = html.slice(html.indexOf("function renderOrdersKanbanToolbar"), html.indexOf("function openOrdersKanbanFullscreen"));
  assert.match(toolbar, /renderOrdersPeriodToggle\(true\)/);
  assert.match(toolbar, /setOrdersKanbanDensity\('compact'\)/);
  assert.match(toolbar, /openOrdersKanbanFullscreen\(\)/);
});

test("full screen uses the browser full screen and Esc closes it", () => {
  assert.match(html, /el\.requestFullscreen\(\)\.catch/);
  assert.match(html, /document\.addEventListener\('fullscreenchange'/);
  assert.match(html, /event\.key === 'Escape' && state\.ordersKanbanFullscreen && !state\.modal/);
});
