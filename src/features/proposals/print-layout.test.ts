import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/client-proposal-view.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

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
