import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("external diagnostics retain failing curl evidence and continue isolated TLS checks", () => {
  const workflow = readFileSync(".github/workflows/server-diagnose.yml", "utf8");
  const script = workflow.split("      - name: From the internet\n        run: |\n")[1].replace(/^          /gm, "");
  const directory = mkdtempSync(join(tmpdir(), "crm-reachability-"));
  const capture = join(directory, "requests");
  writeFileSync(join(directory, "getent"), "#!/bin/sh\nprintf '143.110.136.211 STREAM fixture\\n'\n", { mode: 0o700 });
  writeFileSync(join(directory, "curl"), '#!/bin/sh\n[ "$1" = --version ] && { echo fixture-curl; exit 0; }\nprintf "%s\\n" "$*" >> "$REACHABILITY_CAPTURE"\necho "fixture timeout" >&2\nexit 28\n', { mode: 0o700 });
  try {
    execFileSync("bash", ["-n"], { input: script });
    const output = execFileSync("bash", ["-e"], { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PATH: directory + ":" + process.env.PATH, REACHABILITY_CAPTURE: capture } });
    const requests = readFileSync(capture, "utf8").trim().split("\n");
    assert.equal(requests.length, 5, "a failed default probe must not hide the comparison probes");
    assert.equal((output.match(/curl_exit=28/g) ?? []).length, 5);
    assert.ok(requests.every(request => request.endsWith("https://rolanpro-crm.143-110-136-211.sslip.io/login")));
    assert.ok(requests.every(request => !/(?:^|\s)(?:-k|--insecure)(?:\s|$)/.test(request)));
    assert.ok(requests.some(request => request.includes("--http1.1")));
    assert.ok(requests.some(request => request.includes("--resolve rolanpro-crm.143-110-136-211.sslip.io:443:143.110.136.211")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
