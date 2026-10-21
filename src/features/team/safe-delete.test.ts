import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = () => readFileSync("app/api/v1/team/[userId]/route.ts", "utf8");
const directory = () => readFileSync("components/team-directory.tsx", "utf8");
const legacy = () => readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("employee deletion archives the account instead of erasing audit history", () => {
  const source = route();

  assert.match(source, /export async function DELETE/);
  assert.match(source, /updateTeamMember\(userId, \{ isActive: false \}\)/);
  assert.doesNotMatch(source, /prisma\.user\.delete/);
  assert.match(source, /исторической работе/);
});

test("an owner cannot delete the account they are currently using", () => {
  const source = route();

  assert.match(source, /userId === auth\.session\.user\.user_id/);
  assert.match(source, /Нельзя удалить собственную учётную запись/);
});

test("team directory exposes an explicit confirmed delete action", () => {
  const source = directory();

  assert.match(source, /Удалить сотрудника «\$\{member\.fullName\}»/);
  assert.match(source, /Старые проекты, работы и начисления сохранятся/);
  assert.match(source, /api\(`\/api\/v1\/team\/\$\{member\.userId\}`, "DELETE"\)/);
  assert.match(source, />\s*Удалить\s*</);
  assert.match(source, /можно восстановить из архива/);
  assert.match(source, /<details className=\{styles\.archive\}>/);
  assert.match(source, /Архив сотрудников \(\{inactive\.length\}\)/);
});

test("the visible legacy employee cards expose the same safe delete action", () => {
  const source = legacy();

  assert.match(source, /archiveTeamMemberFromCard\('\$\{u\.id\}'\)/);
  assert.match(source, /method: 'DELETE'/);
  assert.match(source, /Старые проекты, работы и начисления сохранятся/);
  assert.match(source, /card\.active = false/);
  assert.match(source, /g\.role !== 'owner'/);
});
