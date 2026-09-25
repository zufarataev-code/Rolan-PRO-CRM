import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoute = () => readFileSync("app/legacy-crm/route.ts", "utf8");
const teamRoute = () => readFileSync("app/api/v1/team/route.ts", "utf8");
const teamService = () => readFileSync("src/features/team/service.ts", "utf8");

test("owner CRM synchronizes canonical users into the existing Team directory", () => {
  const source = legacyRoute();

  assert.match(source, /id=\"rolanpro-team-directory-sync\"/);
  assert.match(source, /nativeFetch\('\/api\/v1\/team', \{ cache: 'no-store' \}\)/);
  assert.match(source, /linkedIds\.includes\(user\.id\)/);
  assert.match(source, /normalizeEmail\(user\.email\) === email/);
  assert.match(source, /db\.users\.push\(user\)/);
  assert.match(source, /isActive !== false/);
  assert.match(source, /syncCanonicalTeamDirectory\(\{ render: true \}\)/);
});

test("canonical-only user is linked to one legacy compatibility card", () => {
  const source = legacyRoute();

  assert.match(source, /freshLegacyId\(member\)/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /JSON\.stringify\(\{ legacyUserId: user\.id \}\)/);
  assert.match(source, /failed to link legacy card/);
});

test("new employee creation can persist the legacy card id atomically", () => {
  const route = teamRoute();
  const service = teamService();

  assert.match(route, /legacyUserId\?: string/);
  assert.match(route, /legacyUserId: body\.legacyUserId/);
  assert.match(service, /legacyUserId\?: string/);
  assert.match(service, /legacy_user_ids: legacyUserId \? \[legacyUserId\] : \[\]/);
  assert.match(service, /legacyUserIds: user\.legacy_user_ids/);
});

test("failed duplicate create refreshes the directory and opens the existing employee", () => {
  const source = legacyRoute();

  assert.match(source, /method === 'POST'/);
  assert.match(source, /shouldOpenExisting = !response\.ok && Boolean\(requestedEmail\)/);
  assert.match(source, /openEmail: shouldOpenExisting \? requestedEmail : ''/);
  assert.match(source, /openTeamMember\(requestedUser\.id\)/);
  assert.match(source, /Этот сотрудник уже был создан\. Открыта его карточка\./);
});

test("team synchronization stays inside the canonical legacy CRM shell", () => {
  const source = legacyRoute();

  assert.doesNotMatch(source, /\/team-directory/);
  assert.doesNotMatch(source, /localStorage.*team/i);
  assert.doesNotMatch(source, /sessionStorage.*team/i);
});

test("employee creation shows canonical API errors and prevents inaccessible accounts", () => {
  const crm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const service = teamService();

  assert.match(crm, /function teamApiErrorMessage\(payload, status/);
  assert.match(crm, /payload\?\.errors\?\.\[0\]\?\.message/);
  assert.match(crm, /Добавлять сотрудников может только владелец CRM/);
  assert.match(crm, /function setTeamSubmitBusy\(busy\)/);
  assert.match(crm, /Сотрудник не создан/);
  assert.match(service, /const missingRoles = input\.roles\.filter/);
  assert.match(service, /не настроены на сервере/);
  assert.match(service, /if \(missingRoles\.length\)[\s\S]*?prisma\.user\.create/);
});
