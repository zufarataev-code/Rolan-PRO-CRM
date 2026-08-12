import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("kanban cards use pointer drag from the whole card", () => {
  assert.match(
    html,
    /<article class="kanban-card"[^>]*onpointerdown="kanbanPointerStart\(event,'\$\{o\.id\}'\)"/,
  );
  assert.match(html, /document\.addEventListener\('pointermove', kanbanPointerMove/);
  assert.match(html, /document\.addEventListener\('pointerup', event => kanbanPointerFinish\(event\)\)/);
});

test("kanban pointer drag resolves target status from the column", () => {
  assert.match(html, /data-drop-status="\$\{col\.dropStatus\}"/);
  assert.match(html, /drag\.targetStatus = target\?\.dataset\?\.dropStatus \|\| '';/);
  assert.match(html, /kanbanMoveOrder\(drag\.orderId, drag\.targetStatus\)/);
});

test("touch drag starts only from the move handle", () => {
  assert.match(html, /event\.pointerType !== 'mouse' && !handle/);
  assert.match(html, /touch-action: none;/);
});

test("a completed drag does not accidentally open the order", () => {
  assert.match(html, /kanbanSuppressClickUntil = Date\.now\(\) \+ 450;/);
  assert.match(html, /Date\.now\(\) < kanbanSuppressClickUntil/);
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
