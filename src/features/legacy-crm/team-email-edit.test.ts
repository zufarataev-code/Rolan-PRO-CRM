import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner edits the employee login email directly in the employee card", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(source, /id="tm-edit-email" type="email"/);
  assert.match(source, /async function submitTeamMemberEdit/);
  assert.match(source, /legacyUserIds\.includes\(userId\)/);
  assert.match(source, /JSON\.stringify\(\{ email, fullName: name, roles: \[roleOption\.code\], legacyUserId: userId \}\)/);
  assert.doesNotMatch(source, /Почта — это логин на сервере\. Менять её здесь нельзя/);
});

test("owner changes an employee role directly in the employee card", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(source, /<select id="tm-edit-role">/);
  assert.match(source, /legacyRole: 'manager'/);
  assert.match(source, /legacyRole: 'measurer'/);
  assert.match(source, /legacyRole: 'installer'/);
  assert.match(source, /legacyRole: 'owner'/);
  assert.match(source, /roles: \[roleOption\.code\]/);
  assert.match(source, /u\.role = requestedRole/);
  assert.match(source, /u\.id !== viewer\?\.id/);
  assert.match(source, /Свою роль владельца менять нельзя/);
});

test("employee card hydrates canonical email and role from the server account", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(source, /hydrateTeamMemberAccount\(userId\)/);
  assert.match(source, /emailInput\.value = member\.email/);
  assert.match(source, /teamLegacyRoleFromServer\(member\.roles\)/);
  assert.match(source, /priority = \['OWNER', 'MANAGER', 'CONSULTANT', 'INSTALLER'\]/);
  assert.match(source, /emailWasEdited \? enteredEmail : \(canonicalEmail \|\| enteredEmail\)/);
});

test("self email changes refresh the authenticated owner session", () => {
  const route = readFileSync("app/api/v1/team/[userId]/route.ts", "utf8");

  assert.match(route, /refreshOwnSessionIfNeeded/);
  assert.match(route, /sessionCredentialFingerprint\(user\.password_hash\)/);
  assert.match(route, /response\.cookies\.set/);
});

test("cloud employee access patch remains valid without nested inline quotes", () => {
  const route = readFileSync("app/legacy-crm/route.ts", "utf8");

  assert.match(route, /onclick="generateTeamAccessPassword\(\)"/);
  assert.match(route, /window\.generateTeamAccessPassword/);
  assert.doesNotMatch(route, /onclick="const el=document\.getElementById/);
});
