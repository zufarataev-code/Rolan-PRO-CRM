import assert from "node:assert/strict";
import test from "node:test";

import { injectMobileWorkspaceAdapter } from "./mobile-workspace";

test("mobile workspace adapter preserves compact checkbox and radio controls", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(result, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(result, /input\[type="checkbox"\]/);
  assert.match(result, /input\[type="radio"\]/);
  assert.match(result, /width: auto !important/);
  assert.match(result, /flex: 0 0 auto !important/);
});

test("mobile workspace adapter keeps mobile behavior isolated and protects special views", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(result, /@media \(max-width: 768px\)/);
  assert.match(result, /SPECIAL_TABLE_SELECTOR/);
  assert.match(result, /data-rolanpro-mobile-orders/);
  assert.match(result, /data-rolanpro-mobile-proposals/);
  assert.match(result, /calendar\|календар\|scheduler\|расписан\|gantt/);
  assert.match(result, /MutationObserver/);
  assert.match(result, /orientationchange/);
});

test("mobile workspace adapter is injected only once", () => {
  const source = "<!doctype html><body><main></main></body>";
  const once = injectMobileWorkspaceAdapter(source);
  const twice = injectMobileWorkspaceAdapter(once);

  assert.equal((twice.match(/id="rolanpro-mobile-workspace-style"/g) || []).length, 1);
  assert.equal((twice.match(/id="rolanpro-mobile-workspace-script"/g) || []).length, 1);
});
