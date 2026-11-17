import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("CAPI runtime sync validates before output, preserves secrets and clears production test mode", () => {
  const script = "deploy/meta-capi-env.sh";
  const dir = mkdtempSync(join(tmpdir(), "crm-capi-env-"));
  const capture = join(dir, "stdin");
  writeFileSync(join(dir, "ssh"), '#!/bin/bash\ncat > "$META_TEST_CAPTURE"\n', { mode: 0o700 });
  const env = { NODE_ENV: "test" as const, PATH: process.env.PATH, META_CAPI_DATASET_ID: "865337699151965", META_CAPI_UPLOAD_ENABLED: "false", META_CAPI_ACCESS_TOKEN: "offline-token-".repeat(4) + "'-$-`chars`", META_CAPI_TEST_EVENT_CODE: "TEST12345" };
  env.PATH = dir + ":" + env.PATH;
  try {
  for (const invalid of [{ META_CAPI_DATASET_ID: "100" }, { META_CAPI_UPLOAD_ENABLED: "yes" }, { META_CAPI_ACCESS_TOKEN: "" }]) {
    const result = spawnSync("bash", [script, "offline-target"], { env: { ...env, ...invalid, META_TEST_CAPTURE: capture }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(capture), false, "invalid settings must not reach SSH");
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes(env.META_CAPI_ACCESS_TOKEN));
  }
  assert.equal(execFileSync("bash", [script, "offline-target"], { env: { ...env, META_TEST_CAPTURE: capture }, encoding: "utf8" }), "");
  const remote = readFileSync(capture, "utf8");
  rmSync(capture);
  assert.ok(!remote.includes(env.META_CAPI_TEST_EVENT_CODE));
  execFileSync("bash", ["-n"], { input: remote });
  const file = join(dir, "production.env");
  const original = "UNRELATED_SETTING=preserved\nMETA_CAPI_ACCESS_TOKEN=old\nexport META_CAPI_TEST_EVENT_CODE=TEST999\n";
  writeFileSync(file, original, { mode: 0o600 });
  // Execute the actual generated script, replacing only the host's path/user guard.
  const fixture = remote.replaceAll("/home/runcloud/.rolanpro-crm.env.production.local", file).replace('test "$(id -un)" = runcloud', "true");
    for (const enabled of ["false", "true"]) {
      const run = spawnSync("bash", [], { input: fixture.replace("META_CAPI_UPLOAD_ENABLED=false", "META_CAPI_UPLOAD_ENABLED=" + enabled), encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, "");
      assert.equal(run.stderr, "");
      const saved = execFileSync("bash", ["-c", '. "$1"; printf "%s\\n%s\\n%s\\n%s\\n%s" "$META_CAPI_DATASET_ID" "$META_CAPI_ACCESS_TOKEN" "$META_CAPI_UPLOAD_ENABLED" "$META_CAPI_TEST_EVENT_CODE" "$UNRELATED_SETTING"', "_", file], { encoding: "utf8" });
      assert.equal(saved, [env.META_CAPI_DATASET_ID, env.META_CAPI_ACCESS_TOKEN, enabled, "", "preserved"].join("\n"));
      assert.equal(statSync(file).mode & 0o777, 0o600);
    }
    const backups = readdirSync(dir).filter(name => name.includes(".capi-backup-"));
    assert.ok(backups.length > 0);
    assert.ok(backups.some(name => readFileSync(join(dir, name), "utf8") === original));
    for (const name of backups) assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600);
    const before = readFileSync(file, "utf8");
    execFileSync("bash", [], { input: fixture.replace("META_CAPI_UPLOAD_ENABLED=false", "META_CAPI_UPLOAD_ENABLED=true") });
    assert.equal(readFileSync(file, "utf8"), before);
    assert.deepEqual(readdirSync(dir).filter(name => !name.includes(".capi-backup-")).sort(), ["production.env", "ssh"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
