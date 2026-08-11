import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("kanban cards are draggable from the whole card", () => {
  assert.match(
    html,
    /<article class="kanban-card"[^>]*draggable="true"[\s\S]*?ondragstart="kanbanDragStart\(event,'\$\{o\.id\}'\)"/,
  );
});

test("kanban drag keeps a Safari-compatible fallback order id", () => {
  assert.match(html, /let kanbanDraggedOrderId = null;/);
  assert.match(html, /setData\('application\/x-rolanpro-order', orderId\)/);
  assert.match(html, /\|\| kanbanDraggedOrderId;/);
});

test("dropping within the same grouped stage does not move an order backwards", () => {
  assert.match(
    html,
    /currentColumn && targetColumn && currentColumn\.id === targetColumn\.id\) return false/,
  );
});

test("kanban has an accessible stage picker fallback", () => {
  assert.match(html, /function openKanbanStagePicker\(orderId\)/);
  assert.match(html, /aria-label="Переместить заказ"/);
  assert.match(html, /function moveKanbanOrderFromPicker\(orderId, targetStatus\)/);
});
