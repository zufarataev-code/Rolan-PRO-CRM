import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-27: the manager sees film in stock only (no purchases or costs) and only his own pay.
const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("the manager's warehouse is the film on the shelf, without money", () => {
  const from = html.indexOf("function renderManagerFilmStock()");
  const to = html.indexOf("function renderInventory() {");
  const ctx: Record<string, any> = {
    db: { inventory: [
      { catalogId: "f1", remainingLengthM: 10, widthMm: 1524, costTotal: 999 },
      { catalogId: "f1", remainingLengthM: 5, widthMm: 1524, costTotal: 999 },
      { catalogId: "f2", remainingLengthM: 0, widthMm: 1524 },
    ] },
    getCatalogItem: (id: string) => ({ f1: { name: "SP-35" } } as Record<string, unknown>)[id],
    mm2_to_sqft: (mm2: number) => (mm2 / 1_000_000) * 10.7639,
    academyEsc: (v: string) => v,
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(from, to), ctx);
  const out = ctx.renderManagerFilmStock();
  assert.match(out, /SP-35/);
  assert.match(out, /<td class="p-2">2<\/td>/);
  assert.match(out, /15\.0 м · 246 sq ft/);
  assert.doesNotMatch(out, /999|\$/);
  assert.match(html, /function renderInventory\(\) \{\s*if \(currentUser\(\)\?\.role === 'manager'\) return renderManagerFilmStock\(\);/);
});

test("payroll shows the manager only his own row", () => {
  assert.match(html, /u\.role !== 'owner' && u\.active !== false && \(viewer\?\.role === 'owner' \|\| u\.id === viewer\?\.id\)/);
});

test("the team section is the owner's only, in both menus", () => {
  assert.match(html, /\.\.\.\(role === 'owner' \? \[\['team', T\('team'\), '🧑‍🔧'\]\] : \[\]\),/);
  assert.match(html, /\['ratesCosts', 'paymentsdue', 'accounting', 'settings', 'team'\]\.includes\(key\)\) return role === 'owner'/);
  assert.match(readFileSync("src/features/crm-shell/nav.ts", "utf8"), /section\("Команда", "team", UsersRoundIcon, true\)/);
});
