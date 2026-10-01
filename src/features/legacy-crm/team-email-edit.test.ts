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

test("new employee is linked to the legacy card during creation", () => {
  const route = readFileSync("app/api/v1/team/route.ts", "utf8");
  const service = readFileSync("src/features/team/service.ts", "utf8");

  assert.match(route, /legacyUserId\?: string/);
  assert.match(route, /legacyUserId: body\.legacyUserId/);
  assert.match(service, /legacyUserId\?: string/);
  assert.match(service, /legacy_user_ids: legacyUserId \? \[legacyUserId\] : \[\]/);
  assert.match(service, /legacy_user_ids: \{ has: legacyUserId \}/);
});

test("login email edits reach the server account and the access dialog shows its email", () => {
  const route = readFileSync("app/legacy-crm/route.ts", "utf8");

  // The owner's PATCH keeps the email; only roles stay with the canonical directory.
  assert.match(route, /delete body\.roles;/);
  assert.doesNotMatch(route, /delete body\.email/);
  assert.match(route, /\['tm-edit-role'\]\.forEach/);
  // The access dialog opens only with the PostgreSQL email (no stale value to save
  // back), keeps Save disabled without a server account, and reports success
  // only when the server saved the new email.
  assert.match(route, /const account = await loadTeamAccessAccount\(legacyUserId, user\.email \|\| ''\);/);
  assert.match(route, /value="' \+ academyEsc\(serverEmail\) \+ '"/);
  assert.match(route, /onclick="submitTeamMemberAccess\(\)"' \+ \(account\.member \? '' : ' disabled'\)/);
  assert.doesNotMatch(route, /hydrateTeamAccessEmail/);
  assert.match(route, /const savedEmail = String\(updateResult\?\.data\?\.email \|\| ''\)/);
  assert.match(route, /if \(savedEmail !== email\)/);
});

test("card email changes only when the owner typed a new address", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /emailInput\.dataset\.serverEmail = String\(member\.email \|\| ''\)/);
  // Only a typed change is sent; an untouched field (even before hydration) keeps the server login.
  assert.match(html, /id="tm-edit-email" type="email" value="\$\{academyEsc\(u\.email \|\| ''\)\}" oninput="this\.dataset\.touched = '1'"/);
  assert.match(html, /const emailWasEdited = Boolean\(emailTouched && enteredEmail && enteredEmail !== canonicalEmail\);/);
  // Hydration never overwrites a field the owner has typed in.
  assert.match(html, /if \(emailInput && emailInput\.dataset\.touched !== '1' && /);
});

test("a new login email reaches every card linked to the account", () => {
  const route = readFileSync("app/legacy-crm/route.ts", "utf8");
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(route, /linkedIds\.forEach\(\(id\) => \{ const card = getUser\(id\); if \(card\) card\.email = savedEmail; \}\);/);
  assert.match(html, /\.forEach\(id => \{ const card = getUser\(id\); if \(card\) card\.email = email; \}\);/);
});

test("a slow account load never replaces a modal the owner opened or closed meanwhile", () => {
  const route = readFileSync("app/legacy-crm/route.ts", "utf8");
  assert.match(route, /const modalWhenClicked = state\.modal;/);
  assert.match(route, /if \(window\.__teamAccessRequest !== request \|\| state\.modal !== modalWhenClicked\) return;/);
});
