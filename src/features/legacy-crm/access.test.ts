import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LEGACY_WORKSPACE_ROLES } from "./api";
import { ROLE_CODES } from "../../lib/auth/constants";
import { getRolesForPath } from "../../lib/auth/rbac";

test("full legacy workspace is limited to owner and manager roles", () => {
  assert.deepEqual(LEGACY_WORKSPACE_ROLES, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  assert.deepEqual(getRolesForPath("/legacy-crm"), [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  assert.deepEqual(getRolesForPath("/api/v1/legacy-crm/state"), [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
});

test("legacy workspace API applies the role restriction to reads and writes", () => {
  const route = readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8");
  const guardedCalls = route.match(
    /requireRequestSession\(request, LEGACY_WORKSPACE_ROLES\)/g,
  );

  assert.equal(guardedCalls?.length, 2);
});

test("owner settings use a section directory with employee access entry", () => {
  const source = readFileSync(
    "private/legacy/rolanpro-crm-cloud.html",
    "utf8",
  );

  assert.match(source, /title: 'Доступ сотрудников'/);
  assert.match(source, /destination: 'team'/);
  assert.match(source, /function renderSettingsHub\(\)/);
  assert.match(source, /function settingsPanelAttrs\(key\)/);
  assert.match(source, /if \(key === 'settings' && user\?\.role !== 'owner'\) return;/);
});
