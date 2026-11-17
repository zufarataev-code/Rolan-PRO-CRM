import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// deploy/watch-production.sh keeps the production CRM alive. Nov 2026 outages:
// one failed restart left Next.js down until the next commit, and nothing
// watched it during the 10-15 minute on-server build. These tests source the
// script (sourcing does not start the watcher) and drive supervise_next with
// stubbed process control, a fake clock and a fake health endpoint.

const SCRIPT = "deploy/watch-production.sh";
const watcher = readFileSync(SCRIPT, "utf8");

function runScenario(body: string) {
  const prelude = `
set -uo pipefail
source ${SCRIPT}
set +e
FAKE_NOW=1000
now_epoch() { echo "$FAKE_NOW"; }
log() { printf 'LOG %s\\n' "$*"; }
log_memory() { :; }
clear_stale_next() { echo CLEAR; }
release=$(mktemp -d); mkdir -p "$release/.next"; touch "$release/.next/BUILD_ID"
active_dir="$release"
checks_file=$(mktemp)
`;
  const result = spawnSync("bash", ["-c", prelude + body], { encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

test("a dead Next.js is restarted with growing pauses and never abandoned", () => {
  const out = runScenario(`
starts=0
start_next() { starts=$((starts+1)); echo "START $starts"; if [ "$starts" -ge 3 ]; then sleep 60 & child_pid=$!; restart_failures=0; next_restart_at=0; return 0; fi; child_pid=""; return 1; }
true & child_pid=$!; sleep 0.3   # exited, not yet reaped
supervise_next             # attempt 1 fails -> wait 5s
FAKE_NOW=1003; supervise_next   # still waiting
FAKE_NOW=1005; supervise_next   # attempt 2 fails -> wait 15s
FAKE_NOW=1019; supervise_next   # still waiting
FAKE_NOW=1020; supervise_next   # attempt 3 succeeds
echo "STARTS=$starts ALIVE=$([ -n "$child_pid" ] && kill -0 "$child_pid" && echo yes)"
kill "$child_pid"
`);
  assert.match(out, /exited unexpectedly/);
  assert.match(out, /exited with code 0/);
  assert.match(out, /next attempt in 5s/);
  assert.match(out, /next attempt in 15s/);
  assert.match(out, /STARTS=3 ALIVE=yes/);
});

test("a live but unresponsive Next.js is restarted after three failed checks", () => {
  const out = runScenario(`
health_status() { echo 000; }
stop_next() { echo STOP; kill "$child_pid" 2>/dev/null; child_pid=""; }
start_next() { echo START; return 1; }
sleep 60 & child_pid=$!
supervise_next
FAKE_NOW=1015; supervise_next
FAKE_NOW=1030; supervise_next
echo "AFTER3 child=[$child_pid]"
FAKE_NOW=1035; supervise_next
`);
  assert.match(out, /health check \(1\/3\)/);
  assert.match(out, /health check \(3\/3\)/);
  assert.match(out, /unresponsive/);
  assert.match(out, /STOP[\s\S]*AFTER3 child=\[\]/);
  assert.match(out, /AFTER3[\s\S]*START/);
});

test("checks are rate limited and a database-only outage (503) does not restart Next.js", () => {
  const out = runScenario(`
health_status() { echo x >>"$checks_file"; echo 503; }
stop_next() { echo STOP; }
sleep 60 & child_pid=$!
supervise_next; FAKE_NOW=1005; supervise_next; FAKE_NOW=1010; supervise_next
FAKE_NOW=1015; supervise_next; FAKE_NOW=1030; supervise_next; FAKE_NOW=1045; supervise_next
echo "CHECKS=$(wc -l <"$checks_file" | tr -d ' ') FAILURES=$health_failures"
kill "$child_pid"
`);
  assert.doesNotMatch(out, /STOP/);
  assert.match(out, /CHECKS=4 FAILURES=0/);
});

test("the active release keeps being supervised while a long build runs", () => {
  const out = runScenario(`
start_next() { echo START; sleep 60 & child_pid=$!; return 0; }
true & child_pid=$!; sleep 0.3
slow_build() { sleep 3; return 7; }
run_guarded slow_build
echo "BUILD_RC=$? ALIVE=$([ -n "$child_pid" ] && kill -0 "$child_pid" && echo yes)"
kill "$child_pid"
`);
  assert.match(out, /START[\s\S]*BUILD_RC=7 ALIVE=yes/);
});

test("restart pauses grow to a two-minute ceiling", () => {
  const out = runScenario(`for n in 1 2 3 4 5 9; do printf '%s ' "$(restart_delay $n)"; done`);
  assert.equal(out.trim(), "5 15 30 60 120 120");
});

test("watcher never exits on a failed start and caps the runtime heap", () => {
  assert.doesNotMatch(watcher, /start_next "\$active_dir" \|\| exit 1/);
  assert.doesNotMatch(watcher, /deploy_sha "\$current_sha" \|\| exit 1/);
  assert.match(watcher, /while true; do[\s\S]*supervise_next/);
  const start = watcher.indexOf("start_next() {");
  const end = watcher.indexOf("\n}\n", start);
  const startNext = watcher.slice(start, end);
  assert.match(startNext, /--max-old-space-size=\$NEXT_MAX_OLD_SPACE_MB/);
  assert.ok(
    startNext.indexOf("max-old-space-size") < startNext.indexOf("exec ./node_modules/.bin/next start"),
    "heap cap must be set before the server starts",
  );
});

test("long build steps run guarded and at low priority", () => {
  for (const step of ["npm ci", "prisma generate", "npm run build"]) {
    const line = watcher.split("\n").find((candidate) => candidate.includes(step) && candidate.includes("if !"));
    assert.ok(line, step);
    assert.match(line!, /run_guarded in_dir "\$temporary_dir" low_priority/, step);
  }
});
