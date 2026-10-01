import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoute = () => readFileSync("app/legacy-crm/route.ts", "utf8");
const teamRoute = () => readFileSync("app/api/v1/team/route.ts", "utf8");
const teamService = () => readFileSync("src/features/team/service.ts", "utf8");

test("new employee creation can persist the legacy card id atomically", () => {
  const route = teamRoute();
  const service = teamService();

  assert.match(route, /legacyUserId\?: string/);
  assert.match(route, /legacyUserId: body\.legacyUserId/);
  assert.match(service, /legacyUserId\?: string/);
  assert.match(service, /legacy_user_ids: legacyUserId \? \[legacyUserId\] : \[\]/);
  assert.match(service, /legacyUserIds: user\.legacy_user_ids/);
});

test("employee cards are derived on the server, not synchronized in the browser", () => {
  const source = legacyRoute();

  assert.doesNotMatch(source, /rolanpro-team-directory-sync/);
  assert.doesNotMatch(source, /syncCanonicalTeamDirectory/);
  assert.match(readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8"), /applyEmployeeDirectory/);
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
