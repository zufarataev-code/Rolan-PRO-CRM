import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = () => readFileSync(".github/workflows/deploy-production.yml", "utf8");

/**
 * Деплой падал на проверке доступности уже ПОСЛЕ того, как сервер активировал
 * релиз: один `curl --max-time 15` в холодный Next.js, `set -e` — и вся сборка
 * помечена упавшей, хотя код на сервере. С 2026-11-05 так случилось 20 раз
 * подряд, и красный индикатор перестал что-либо значить.
 *
 * Проверка доступности обязана повторяться, а сообщения — различать «релиз не
 * активировался» и «релиз активен, но сайт не отвечает».
 */

test("the health check retries instead of failing the deploy on a single slow answer", () => {
  const source = workflow();

  assert.match(source, /for health in \$\(seq 1 20\); do/);
  assert.match(source, /--head --max-time 20/);
  assert.match(source, /sslip\.io\/login/);
  assert.doesNotMatch(source, /--max-time 15/);
  assert.match(source, /Health check \$health\/20 did not answer yet/);
});

test("an activated release is reported before the site is probed", () => {
  const source = workflow();
  const activation = source.indexOf("is active on the server. Checking that it answers.");
  const probe = source.indexOf("for health in");

  assert.ok(activation > 0, "the workflow announces that the release is active");
  assert.ok(probe > activation, "the announcement comes before the health probe");
});

test("the two failure modes are told apart", () => {
  const source = workflow();

  assert.match(
    source,
    /active on the server, but the public login page did not answer within the extended warm-up window/,
    "reachability failure says the code is deployed",
  );
  assert.match(
    source,
    /The release never became active on the server/,
    "activation failure says the release never landed",
  );
});
