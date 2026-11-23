import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const cabinet = readFileSync("private/legacy/project-cabinet.js", "utf8");

test("the measurement shows only directions with a service or windows; the one with windows opens first", () => {
  assert.match(html, /const kept = unique\.filter\(value => withWindows\.has\(value\) \|\| sizedKeys\.has\(value\)\);/);
  assert.match(html, /return \[\.\.\.kept\.filter\(value => withWindows\.has\(value\)\), \.\.\.kept\.filter\(value => !withWindows\.has\(value\)\)\];/);
  assert.match(html, /if \(!withWindows\.size && !sizedKeys\.size\) return unique;/, "a brand-new project still gets its lead direction");
});

test("removing the last film service of a direction removes the direction from the project", () => {
  assert.match(cabinet, /o\.serviceTypes = \(o\.serviceTypes \|\| \[\]\)\.filter\(type => type !== direction\);/);
  assert.match(cabinet, /if \(o\.measureScope === direction\) delete o\.measureScope;/);
});
