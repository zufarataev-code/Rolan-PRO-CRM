import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { BEFORE_PAINT_SCRIPT } from "./before-paint";

const PATCH_SOURCES = [
  "src/features/legacy-crm/surveyor-task-actions.ts",
  "src/features/legacy-crm/mobile-proposals-core.ts",
  "src/features/legacy-crm/order-intake-cleanup.ts",
  "src/features/legacy-crm/mobile-workspace.ts",
  "src/features/legacy-crm/html-shell.ts",
  "src/features/legacy-crm/role-ui.ts",
  "app/legacy-crm/route.ts",
];

function loadScheduler() {
  const microtasks: Array<() => void> = [];
  const frames: Array<() => void> = [];
  const window: Record<string, unknown> = { requestAnimationFrame: (cb: () => void) => frames.push(cb) };
  const context = vm.createContext({ window, queueMicrotask: (cb: () => void) => microtasks.push(cb) });
  vm.runInContext(`${BEFORE_PAINT_SCRIPT}; this.beforePaint = beforePaint;`, context);
  return { beforePaint: (context as unknown as { beforePaint: (cb: () => void) => void }).beforePaint, microtasks, frames };
}

test("DOM patches run before the browser paints the render, not one frame later", () => {
  const { beforePaint, microtasks, frames } = loadScheduler();
  let ran = 0;
  beforePaint(() => { ran += 1; });
  assert.equal(microtasks.length, 1, "the patch is a microtask");
  assert.equal(frames.length, 1, "only the per-frame counter reset waits for a frame");
  microtasks.shift()?.();
  assert.equal(ran, 1);
});

test("a patch that keeps re-triggering itself falls back to the next frame instead of freezing", () => {
  const { beforePaint, microtasks, frames } = loadScheduler();
  for (let i = 0; i < 60; i += 1) beforePaint(() => undefined);
  assert.equal(microtasks.length, 50);
  assert.equal(frames.length, 1 + 10, "one counter reset + ten deferred runs");
});

test("every legacy DOM patch uses beforePaint instead of waiting for an animation frame", () => {
  for (const file of PATCH_SOURCES) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\$\{BEFORE_PAINT_SCRIPT\}/, `${file} embeds the scheduler`);
    assert.match(source, /beforePaint\(/, `${file} schedules through it`);
    assert.doesNotMatch(source, /window\.requestAnimationFrame\(\(\) => \{\n\s+queued = false;/, `${file} still waits a frame`);
  }
  assert.doesNotMatch(readFileSync("app/legacy-crm/route.ts", "utf8"), /MutationObserver\(\(\) => window\.requestAnimationFrame\(ensureCalculatorNav\)\)/);
});

test("the client list does not crash on a client without a source", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.doesNotMatch(html, /c\.source\.charAt\(0\)/);
  assert.match(html, /<span class="tag">\$\{academyEsc\(sourceDisplayLabel\(c\.source\)\)\}<\/span>/);
});
