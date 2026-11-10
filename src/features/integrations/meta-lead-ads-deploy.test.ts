import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Meta secret sync retains absent config, rejects partial config and transmits complete secrets only via quoted stdin", () => {
  const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  const step = workflow.split("      - name: Sync protected Meta Lead Ads configuration when supplied\n")[1].split("      - name:")[0];
  const forms = step.match(/^          META_LEAD_ADS_FORM_IDS: "([\d,]+)"$/m)?.[1];
  assert.equal(forms, "1126644350232479,1805660454094850,2227922148076022,1330965225736016,2548967978927243,2566162043862965");
  assert.doesNotMatch(step, /secrets\.META_LEAD_ADS_FORM_IDS/);
  const script = step.split("        run: |\n")[1].replace(/^          /gm, "");
  const directory = mkdtempSync(join(tmpdir(), "meta-secret-sync-"));
  const scriptPath = join(directory, "sync.sh"), capture = join(directory, "stdin");
  writeFileSync(scriptPath, script);
  writeFileSync(join(directory, "ssh"), '#!/bin/bash\ncat > "$META_TEST_CAPTURE"\n', { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: directory + ":" + process.env.PATH, META_TEST_CAPTURE: capture };
  const keys = ["APP_SECRET", "VERIFY_TOKEN", "PAGE_ACCESS_TOKEN", "PAGE_ID"].map(key => "META_LEAD_ADS_" + key);
  keys.forEach(key => delete env[key]);
  env.META_LEAD_ADS_FORM_IDS = forms;
  try {
    execFileSync("bash", ["-n", scriptPath]);
    const absent = spawnSync("bash", [scriptPath], { env, encoding: "utf8" });
    assert.equal(absent.status, 0); assert.match(absent.stdout, /retaining server configuration/);
    assert.equal(existsSync(capture), false);
    const partial = spawnSync("bash", [scriptPath], { env: { ...env, META_LEAD_ADS_APP_SECRET: "a".repeat(32) }, encoding: "utf8" });
    assert.notEqual(partial.status, 0);
    assert.equal(existsSync(capture), false);
    const token = "offline-token-with-'quotes-$-and-`characters`";
    const complete = spawnSync("bash", [scriptPath], { env: { ...env, META_LEAD_ADS_APP_SECRET: "a".repeat(32), META_LEAD_ADS_VERIFY_TOKEN: "v".repeat(32), META_LEAD_ADS_PAGE_ACCESS_TOKEN: token, META_LEAD_ADS_PAGE_ID: "100" }, encoding: "utf8" });
    assert.equal(complete.status, 0, complete.stderr);
    assert.equal(complete.stdout, ""); assert.equal(complete.stderr, "");
    execFileSync("bash", ["-n", capture]);
    const remote = readFileSync(capture, "utf8");
    const assignments = remote.slice(0, remote.indexOf("env_file="));
    assert.equal(execFileSync("bash", ["-c", assignments + '\nprintf "%s" "$META_LEAD_ADS_PAGE_ACCESS_TOKEN"'], { encoding: "utf8" }), token);
    const envFile = join(directory, "production.env");
    writeFileSync(envFile, "META_LEAD_ADS_FORM_IDS=1126644350232479\nUNRELATED_SETTING=preserved\n", { mode: 0o600 });
    execFileSync("bash", ["-c", remote.replaceAll("/home/runcloud/.rolanpro-crm.env.production.local", '"$META_TEST_ENV_FILE"')], {
      env: { ...env, META_TEST_ENV_FILE: envFile },
    });
    const saved = execFileSync("bash", ["-c", '. "$1"; printf "%s\\n%s" "$META_LEAD_ADS_FORM_IDS" "$UNRELATED_SETTING"', "_", envFile], { encoding: "utf8" });
    assert.equal(saved, forms + "\npreserved");
    assert.equal(statSync(envFile).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
