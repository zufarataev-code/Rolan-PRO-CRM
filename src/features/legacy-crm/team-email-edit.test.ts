import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner edits the employee login email directly in the employee card", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(source, /id="tm-edit-email" type="email"/);
  assert.match(source, /async function submitTeamMemberEdit/);
  assert.match(source, /legacyUserIds\.includes\(userId\)/);
  assert.match(source, /JSON\.stringify\(\{ email, fullName: name, legacyUserId: userId \}\)/);
  assert.doesNotMatch(source, /Почта — это логин на сервере\. Менять её здесь нельзя/);
});

test("self email changes refresh the authenticated owner session", () => {
  const route = readFileSync("app/api/v1/team/[userId]/route.ts", "utf8");

  assert.match(route, /refreshOwnSessionIfNeeded/);
  assert.match(route, /sessionCredentialFingerprint\(user\.password_hash\)/);
  assert.match(route, /response\.cookies\.set/);
});
