import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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


test("mobile workspace preserves the seven-column month calendar instead of stacking weekdays", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(result, /const isProtectedCalendarLayout/);
  assert.match(result, /\.calendar-month-grid/);
  assert.match(result, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\) !important/);
  assert.match(result, /protectCalendarLayouts\(\)/);
  assert.match(result, /element\.classList\.contains\('grid-cols-7'\)/);
});

test("mobile bottom navigation has restrained semantic color accents", () => {
  const result = injectMobileWorkspaceAdapter("<!doctype html><body><main></main></body>");

  assert.match(result, /\.mobile-primary-nav > \*:nth-child\(1\)/);
  assert.match(result, /--mobile-nav-accent: #29A7E1/);
  assert.match(result, /--mobile-nav-accent: #10253F/);
  assert.match(result, /--mobile-nav-accent: #475569/);
  assert.match(result, /--mobile-nav-accent: #147DAC/);
  assert.match(result, /--mobile-nav-accent: #64748B/);
  assert.match(result, /aria-current="page"/);
});


test("legacy CRM implements a phone-specific month calendar with day drill-down", async () => {
  const source = await readFile(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");

  assert.match(source, /\.calendar-mobile-month-grid/);
  assert.match(source, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(source, /calendar-mobile-day-dots/);
  assert.match(source, /calendar-mobile-day-count/);
  assert.match(source, /calendarMobileSelectedDate/);
  assert.match(source, /calendar-mobile-agenda/);
  assert.match(source, /selectedEvents\.map\(ev => renderCalendarEventCard/);
});
