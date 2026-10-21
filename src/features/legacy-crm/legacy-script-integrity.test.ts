import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? "";

test("legacy CRM exposes each top-level function exactly once", () => {
  assert.ok(script, "the main legacy CRM script must exist");

  const source = ts.createSourceFile(
    "rolanpro-crm-cloud.js",
    script,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declarations = new Map<string, number[]>();

  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const position = source.getLineAndCharacterOfPosition(statement.name.getStart(source));
    const lines = declarations.get(statement.name.text) ?? [];
    lines.push(position.line + 1);
    declarations.set(statement.name.text, lines);
  }

  const duplicates = [...declarations.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([name, lines]) => `${name} (${lines.join(", ")})`)
    .sort();

  assert.deepEqual(
    duplicates,
    [],
    `top-level function declarations shadow each other: ${duplicates.join("; ")}`,
  );
});

test("the one work-order printer uses the canonical work-order renderer", () => {
  const printers = [...script.matchAll(/function\s+printWorkOrder\s*\(/g)];
  assert.equal(printers.length, 1);

  const start = printers[0].index ?? -1;
  const end = script.indexOf("function workOrderPrintCss", start);
  const printer = script.slice(start, end);

  assert.match(printer, /renderWorkOrderHtml\(order, true\)/);
  assert.doesNotMatch(printer, /calcFilmPlan|roomsHtml|totalsRows/);
});
