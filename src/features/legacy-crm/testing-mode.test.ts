import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner, 2026-11-27: «пока мы тестируем — сними все ограничения, все».
const route = readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const cabinet = readFileSync("private/legacy/project-cabinet.js", "utf8");

test("only the owner switches the testing mode; the saved switch decides", () => {
  assert.match(route, /if \(!isOwner && nextSettings && JSON\.stringify\(nextSettings\.testingMode/);
  assert.match(route, /const testingMode = \(currentSettings\.testingMode as \{ on\?: unknown \} \| undefined\)\?\.on === true;/);
  assert.match(stages, /function setCrmTestingMode\(on\) \{\s*if \(currentUser\(\)\?\.role !== 'owner'\) return;/);
});

test("while it is on, the business-rule checks do not reject a save", () => {
  for (const code of ["invalid_service_approval", "invalid_production_stage", "invalid_service_solution", "invalid_project_expense"]) {
    assert.match(route, new RegExp(`if ?\\(rule\\(\\w+\\)\\) return (?:apiError\\(400, ?|refuseSave\\()"${code}"`));
  }
  assert.match(route, /if \(!testingMode && !auth\.session\.roles\.includes\(ROLE_CODES\.OWNER\) && \(JSON\.stringify\(order\.googleAdsCostsReview\)/);
  assert.match(route, /if \(!testingMode && !auth\.session\.roles\.includes\(ROLE_CODES\.OWNER\) && \(order\.canonicalLeadId/);
});

test("in the browser, closed projects open for managers and stages skip checks", () => {
  assert.match(cabinet, /if \(typeof crmTestingMode === 'function' && crmTestingMode\(\)\) return false;/);
  assert.match(stages, /function crmImportMode\(\) \{\s*try \{ return crmTestingMode\(\) \|\|/);
  assert.match(stages, /onclick="setCrmTestingMode\(\$\{!testing\}\)"/);
});
