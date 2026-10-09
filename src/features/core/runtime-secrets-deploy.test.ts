import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watcher = readFileSync("deploy/watch-production.sh", "utf8");

test("Next.js reloads the canonical protected environment on every start", () => {
  const start = watcher.indexOf("start_next() {");
  const end = watcher.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start, "start_next function");

  const startNext = watcher.slice(start, end);
  assert.match(startNext, /set -a\s+[\s\S]*\. \"\$ENV_BACKUP\" \|\| exit 1[\s\S]*set \+a/);
  assert.ok(
    startNext.indexOf('. "$ENV_BACKUP" || exit 1') < startNext.indexOf("exec ./node_modules/.bin/next start"),
    "protected environment must be loaded before the server process",
  );
});
