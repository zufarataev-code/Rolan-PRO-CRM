import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LEGACY_WORKSPACE_ROLES, LEGACY_WORKSPACE_VIEW_ROLES } from "./api";
import { ROLE_CODES } from "../../lib/auth/constants";
import { getRolesForPath } from "../../lib/auth/rbac";

test("the full payload is privileged while every employee may enter the workspace", () => {
  assert.deepEqual(LEGACY_WORKSPACE_ROLES, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  assert.deepEqual(LEGACY_WORKSPACE_VIEW_ROLES, [
    ROLE_CODES.OWNER,
    ROLE_CODES.MANAGER,
    ROLE_CODES.CONSULTANT,
    ROLE_CODES.INSTALLER,
  ]);
  assert.deepEqual(getRolesForPath("/legacy-crm"), LEGACY_WORKSPACE_VIEW_ROLES);
  assert.deepEqual(getRolesForPath("/api/v1/legacy-crm/state"), LEGACY_WORKSPACE_VIEW_ROLES);
});

test("legacy workspace API applies role-aware filtering to reads and writes", () => {
  const route = readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8");
  const guardedCalls = route.match(
    /requireRequestSession\(request, LEGACY_WORKSPACE_VIEW_ROLES\)/g,
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

test("every employee card exposes photo upload and preview controls", () => {
  const source = readFileSync(
    "private/legacy/rolanpro-crm-cloud.html",
    "utf8",
  );

  assert.match(source, /onclick="openTeamMemberPhoto\('\$\{u\.id\}'\)"/);
  assert.match(source, /function openTeamMemberPhoto\(userId\)/);
  assert.match(source, /function submitTeamMemberPhoto\(userId\)/);
  assert.match(source, /compressTeamPhoto\(file/);
  assert.match(source, /Сохранить фото/);
});

test("dashboard heading follows the current employee role", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(source, /u\.role === 'owner'\) return T\('welcomeOwner'\)/);
  assert.match(source, /u\.role === 'manager'\) return T\('welcomeManager'\)/);
  assert.match(source, /u\.role === 'measurer'\) return T\('welcomeMeasurer'\)/);
});
