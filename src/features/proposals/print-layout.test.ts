import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/client-proposal-view.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const premiumStyles = readFileSync("app/proposal-premium.css", "utf8");
const serializers = readFileSync("src/features/proposals/serializers.ts", "utf8");

test("public proposal exposes one dedicated print document", () => {
  assert.match(component, /className="proposal-print-document"/);
  assert.match(component, /window\.print\(\)/);
  assert.match(component, /printableItems\.map/);
});

test("proposal print blocks cannot split across pages", () => {
  assert.match(styles, /\.proposal-print-item[\s\S]*?break-inside:\s*avoid/);
  assert.match(styles, /\.proposal-print-closing[\s\S]*?page-break-inside:\s*avoid/);
  assert.match(styles, /\.proposal-print-signatures[\s\S]*?page-break-inside:\s*avoid/);
});

test("public proposal has a branded architectural cover and decision flow", () => {
  assert.match(component, /\/landing\/rolan-logo\.webp/);
  assert.match(premiumStyles, /url\('\/landing\/hero-window-film\.jpg'\)/);
  assert.match(component, /Recommended solution/);
  assert.match(component, /Your project, room by room/);
  assert.match(component, /What happens after approval/);
  assert.match(component, /Approve your proposal/);
});

test("public proposal exposes measured film performance without inventing missing values", () => {
  assert.match(serializers, /measurement_snapshot: item\.measurement_snapshot/);
  assert.match(serializers, /vlt_percent: item\.film\.vlt_percent == null \? null/);
  assert.match(component, /getMeasurementSummary/);
  assert.match(component, /uniqueFilmsWithSpecs/);
});
