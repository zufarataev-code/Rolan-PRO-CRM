import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildLegacyStaticShell, legacyStaticShell, resetLegacyStaticShellCache } from "./static-shell";

// Owner, 2026-11-22: «CRM не должна тормозить» — the page is composed once per
// release instead of on every request.
test("the composed page is built once and reused while the files do not change", async () => {
  resetLegacyStaticShellCache();
  const t0 = performance.now();
  const first = await legacyStaticShell();
  const cold = performance.now() - t0;
  const t1 = performance.now();
  const second = await legacyStaticShell();
  const warm = performance.now() - t1;
  assert.equal(second, first);
  assert.ok(warm < cold / 5, `warm ${warm.toFixed(1)}ms vs cold ${cold.toFixed(1)}ms`);
  assert.equal(first, await buildLegacyStaticShell(), "cache returns exactly what a fresh build gives");
  assert.match(first, /Загрузка ROLANPRO CRM…/);
  assert.match(first, /function openProjectEditor\(/, "modules are composed in");
});

test("the route reads the cached page, not the files", () => {
  const route = readFileSync(join(process.cwd(), "app/legacy-crm/route.ts"), "utf8");
  assert.match(route, /const cloudHtml = await legacyStaticShell\(\);/);
  assert.doesNotMatch(route, /composeProductionHtml\(/);
});
