import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = () => readFileSync("src/features/team/service.ts", "utf8");

/**
 * Владелец удаляет сотрудника, потом заводит нового с той же почтой и получает
 * Удаление архивирует аккаунт (см. safe-delete.test.ts). Повторное добавление
 * той же почты должно восстановить прежний user_id, а не создать дубликат и не
 * потерять историю работ.
 */

test("an archived email restores the same employee account", () => {
  const source = service();

  assert.match(source, /if \(existing\?\.is_active\)/);
  assert.match(source, /where: \{ user_id: existing\.user_id \}/);
  assert.match(source, /is_active: true/);
  assert.match(source, /must_change_password: true/);
  assert.match(source, /restored: true/);
});

test("the message names the employee instead of saying only that the email is taken", () => {
  const source = service();

  assert.match(source, /Эта почта уже у сотрудника «\$\{existing\.full_name\}»/);
  assert.match(source, /занята сотрудником «\$\{existing\.full_name\}»/);
  assert.doesNotMatch(source, /Пользователь с такой почтой уже есть/);
});

test("active duplicate email and email re-pointing still read the active flag", () => {
  const source = service();
  const lookups = source.match(/prisma\.user\.findUnique\(\{\s*\n?\s*where: \{ email \}/g) ?? [];

  assert.equal(lookups.length, 2, "create and update both look the email up");

  for (const call of source.split("emailTakenMessage(existing)").slice(0, -1)) {
    assert.match(call.slice(-400), /is_active/, "each lookup selects is_active");
  }
});

test("restoration replaces roles atomically while keeping the historical user id", () => {
  const source = service();
  const restore = source.match(/if \(existing\) \{[\s\S]*?restored: true,[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(restore, /prisma\.\$transaction/);
  assert.match(restore, /userAccess\.deleteMany/);
  assert.match(restore, /userAccess\.createMany/);
  assert.match(restore, /userId: restored\.user_id/);
  assert.doesNotMatch(restore, /prisma\.user\.create/);
});
