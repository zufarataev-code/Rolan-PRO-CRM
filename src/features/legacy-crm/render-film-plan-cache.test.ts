import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-11-22: «CRM не должна тормозить». The film plan is computed once
// per project per screen render, and never cached outside a render.
const html = readFileSync(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");

function body(name: string) {
  const start = html.indexOf(`function ${name}(`);
  let depth = 0;
  for (let i = html.indexOf(") {", start) + 2; i < html.length; i++) {
    if (html[i] === "{") depth++;
    if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(name);
}

test("inside a render the plan is computed once per project; outside it is always fresh", () => {
  const ctx: any = { calls: 0 };
  vm.createContext(ctx);
  vm.runInContext(`let __filmPlanRenderCache = null; ${body("calcFilmPlan")}
    function calcFilmPlanCompute(o) { calls += 1; return { id: o.id, n: calls }; }`, ctx);
  const a = { id: "a" }, b = { id: "b" };
  vm.runInContext("__filmPlanRenderCache = new WeakMap()", ctx);
  const first = ctx.calcFilmPlan(a);
  assert.equal(ctx.calcFilmPlan(a), first);
  ctx.calcFilmPlan(b);
  assert.equal(ctx.calls, 2);
  vm.runInContext("__filmPlanRenderCache = null", ctx);
  ctx.calcFilmPlan(a);
  ctx.calcFilmPlan(a);
  assert.equal(ctx.calls, 4, "no cache between renders: edits are always seen");
});

test("renderNow opens the cache only around the screen build and always closes it", () => {
  const render = body("renderNow");
  assert.match(render, /__filmPlanRenderCache = new WeakMap\(\);\n  let html;\n  try \{ html = renderAppShell\(\); \} finally \{ __filmPlanRenderCache = null; \}/);
});
