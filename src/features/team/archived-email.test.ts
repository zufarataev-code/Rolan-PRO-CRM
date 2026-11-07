import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = () => readFileSync("src/features/team/service.ts", "utf8");

/**
 * Владелец удаляет сотрудника, потом заводит нового с той же почтой и получает
 * «Пользователь с такой почтой уже есть» — про человека, которого сам же удалил.
 * Удаление архивирует аккаунт (см. safe-delete.test.ts), поэтому почта остаётся
 * занятой. Сообщение обязано это объяснить и назвать следующий шаг.
 */

test("an email held by an archived employee explains who holds it and how to proceed", () => {
  const source = service();

  assert.match(source, /function emailTakenMessage/);
  assert.match(source, /is_active/);
  assert.match(source, /лежит в архиве/);
  assert.match(source, /Архив сотрудников/);
  assert.match(source, /заведите нового с другой почтой/);
});

test("the message names the employee instead of saying only that the email is taken", () => {
  const source = service();

  assert.match(source, /Эта почта уже у сотрудника «\$\{existing\.full_name\}»/);
  assert.match(source, /занята сотрудником «\$\{existing\.full_name\}»/);
  assert.doesNotMatch(source, /Пользователь с такой почтой уже есть/);
});

test("both creating and re-pointing an email read the active flag", () => {
  const source = service();
  const lookups = source.match(/prisma\.user\.findUnique\(\{\s*\n?\s*where: \{ email \}/g) ?? [];

  assert.equal(lookups.length, 2, "create and update both look the email up");

  for (const call of source.split("emailTakenMessage(existing)").slice(0, -1)) {
    assert.match(call.slice(-400), /is_active/, "each lookup selects is_active");
  }
});
