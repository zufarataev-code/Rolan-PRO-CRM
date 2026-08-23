import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("demo login checks the development-only feature flag before database access", () => {
  const route = readFileSync("app/api/v1/auth/demo-login/route.ts", "utf8");
  const featureFlagCheck = route.indexOf("if (!getEnv().demoLoginEnabled)");
  const firstUserLookup = route.indexOf("prisma.user.findUnique");

  assert.ok(featureFlagCheck >= 0);
  assert.ok(firstUserLookup > featureFlagCheck);
  assert.match(route, /status:\s*404/);
});
