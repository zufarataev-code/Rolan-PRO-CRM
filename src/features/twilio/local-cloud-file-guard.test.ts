import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const legacyCrm = readFileSync(resolve("private/legacy/rolanpro-crm-cloud.html"), "utf8");

test("local cloud HTML cannot impersonate the connected CRM", () => {
  assert.match(legacyCrm, /const ROLANPRO_LOCAL_FILE = location\.protocol === 'file:'/);
  assert.match(legacyCrm, /if \(ROLANPRO_LOCAL_FILE\) renderLocalCloudFileGuard\(\)/);
  assert.match(legacyCrm, /SMS работает только в рабочей CRM/);
  assert.match(legacyCrm, /Открыть рабочую RolanPRO CRM/);
});
