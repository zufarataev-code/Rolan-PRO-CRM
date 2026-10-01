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

  assert.match(result, /@media \(max-width: 520px\), \(max-width: 768px\) and \(pointer: coarse\)/);
  assert.match(result, /const phoneLayoutActive/);
  assert.match(result, /\(min-width: 521px\) and \(max-width: 840px\) and \(pointer: fine\)/);
  assert.match(result, /\.mobile-primary-nav,[\s\S]*?display: none !important/);
  assert.match(result, /SPECIAL_TABLE_SELECTOR/);
  assert.match(result, /data-rolanpro-mobile-orders/);
  assert.match(result, /data-rolanpro-mobile-proposals/);
  assert.match(result, /calendar\|календар\|scheduler\|расписан\|gantt/);
  assert.match(result, /MutationObserver/);
  assert.match(result, /orientationchange/);
  assert.match(result, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
});

test("project workspaces keep their actions visible above the phone dock", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(result, /\.modal-backdrop\.order-workspace-backdrop \{[\s\S]*?z-index: 80 !important/);
  assert.match(result, /\.modal-content\.workspace-modal\.order-workspace-modal \{[\s\S]*?height: 100dvh !important/);
  assert.match(result, /grid-template-rows: auto minmax\(0, 1fr\) !important/);
  assert.match(result, /\.order-workspace-modal \.order-workspace-modal-body \{[\s\S]*?overflow-y: auto !important/);
  assert.match(result, /\.order-workspace-modal \.project-estimate-footer \{[\s\S]*?bottom: 0 !important/);
  assert.match(result, /padding-bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\) !important/);
});

test("mobile workspace adapter is injected only once", () => {
  const source = "<!doctype html><body><main></main></body>";
  const once = injectMobileWorkspaceAdapter(source);
  const twice = injectMobileWorkspaceAdapter(once);

  assert.equal((twice.match(/id="rolanpro-mobile-workspace-style"/g) || []).length, 1);
  assert.equal((twice.match(/id="rolanpro-mobile-workspace-script"/g) || []).length, 1);
});


test("mobile calendar keeps the live dispatch week horizontal", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(
    result,
    /\.dispatch-week-head,[\s\S]*?\.dispatch-time-grid \{[\s\S]*?grid-template-columns: 44px repeat\(7, minmax\(0, 1fr\)\) !important/,
  );
  assert.match(result, /\.dispatch-week-scroll \{[\s\S]*?overflow-x: hidden !important/);
  assert.match(result, /\.dispatch-event-meta \{[\s\S]*?display: none !important/);
  assert.match(result, /const isProtectedCalendarLayout/);
  assert.match(result, /'\.dispatch-week-head'/);
  assert.match(result, /'\.dispatch-time-grid'/);
  assert.match(result, /protectCalendarLayouts\(\)/);
  assert.match(result, /isProtectedCalendarLayout\(element\)/);
});
