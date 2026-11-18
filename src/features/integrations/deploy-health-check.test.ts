import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("external phase output cannot turn a failed deployment probe into success", () => {
  const script = workflow().split("      - name: Wait for server deployment\n")[1].split("        run: |\n")[1].replace(/^          /gm, "");
  const directory = mkdtempSync(join(tmpdir(), "crm-deploy-health-"));
  const capture = join(directory, "calls");
  writeFileSync(join(directory, "ssh"), '#!/bin/sh\nprintf "%s\\n" "$EXPECTED_SHA"\n', { mode: 0o700 });
  writeFileSync(join(directory, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  writeFileSync(join(directory, "curl"), '#!/bin/sh\nprintf "probe\\n" >> "$HEALTH_TEST_CAPTURE"\nif [ "$HEALTH_TEST_EXIT" = 0 ]; then echo "External health http=200"; else echo "External health http=000 tcp=0 tls=0 total=20"; echo "fixture connection timeout" >&2; fi\nexit "$HEALTH_TEST_EXIT"\n', { mode: 0o700 });
  const env = { ...process.env, PATH: directory + ":" + process.env.PATH, EXPECTED_SHA: "a".repeat(40), HEALTH_TEST_CAPTURE: capture };
  try {
    const failed = spawnSync("bash", [], { input: script, encoding: "utf8", env: { ...env, HEALTH_TEST_EXIT: "28" } });
    assert.equal(failed.status, 1);
    assert.equal(readFileSync(capture, "utf8").trim().split("\n").length, 20);
    assert.match(failed.stdout, /External health http=000/);
    assert.match(failed.stderr, /fixture connection timeout/);
    assert.match(failed.stderr, /active on the server, but the public login page did not answer/);
    rmSync(capture);
    const healthy = spawnSync("bash", [], { input: script, encoding: "utf8", env: { ...env, HEALTH_TEST_EXIT: "0" } });
    assert.equal(healthy.status, 0);
    assert.equal(readFileSync(capture, "utf8").trim().split("\n").length, 1);
    assert.match(healthy.stdout, /Production is serving/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
