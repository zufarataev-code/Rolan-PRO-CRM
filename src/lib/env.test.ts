import assert from "node:assert/strict";
import test from "node:test";

import { getEnv } from "./env";

function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production refuses to start with a missing or placeholder auth secret", () => {
  withEnvironment({ NODE_ENV: "production", AUTH_SECRET: undefined }, () => {
    assert.throws(() => getEnv(), /AUTH_SECRET/);
  });

  withEnvironment(
    { NODE_ENV: "production", AUTH_SECRET: "change-me-before-production" },
    () => assert.throws(() => getEnv(), /AUTH_SECRET/),
  );
});

test("production accepts a unique auth secret of at least 32 characters", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_SECRET: "audit-test-secret-that-is-longer-than-32-characters",
      ENABLE_DEMO_LOGIN: "true",
    },
    () => {
      const env = getEnv();
      assert.equal(env.demoLoginEnabled, false);
      assert.equal(env.nodeEnv, "production");
    },
  );
});

test("demo login requires an explicit development-only opt in", () => {
  withEnvironment(
    { NODE_ENV: "development", ENABLE_DEMO_LOGIN: undefined },
    () => assert.equal(getEnv().demoLoginEnabled, false),
  );

  withEnvironment(
    { NODE_ENV: "development", ENABLE_DEMO_LOGIN: "true" },
    () => assert.equal(getEnv().demoLoginEnabled, true),
  );
});
