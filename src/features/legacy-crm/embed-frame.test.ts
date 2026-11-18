import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { EMBED_FRAME_CSS, EMBED_FRAME_SCRIPT } from "./embed-frame";

function run(top: boolean, parentPath: string) {
  const attrs: Record<string, string> = {};
  const win: Record<string, unknown> = { parent: { location: { pathname: parentPath } } };
  win.self = win;
  win.top = top ? win : {};
  vm.runInNewContext(EMBED_FRAME_SCRIPT.replace(/<\/?script>/g, ""), {
    window: win,
    document: { documentElement: { setAttribute: (key: string, value: string) => { attrs[key] = value; } } },
  });
  return attrs["data-rp-embed"];
}

test("the working CRM steps aside only inside the new interface", () => {
  assert.equal(run(false, "/crm/section/leads"), "1");
  assert.equal(run(false, "/crm"), "1");
  assert.equal(run(true, "/crm"), undefined, "opened directly it stays as it was");
  assert.equal(run(false, "/crmx"), undefined);
  assert.equal(run(false, "/somewhere"), undefined);
});

test("every rule of the embedded mode is scoped to it", () => {
  for (const selector of EMBED_FRAME_CSS.split("}").map((rule) => rule.split("{")[0]).join(",").split(",").map((part) => part.trim()).filter(Boolean)) {
    assert.ok(selector.startsWith('html[data-rp-embed="1"]'), selector);
  }
  assert.ok(EMBED_FRAME_CSS.includes(".app-sidebar"));
  assert.ok(EMBED_FRAME_CSS.includes(".mobile-primary-nav"));
});
