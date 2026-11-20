import assert from "node:assert/strict";
import test from "node:test";

import { checkHealth } from "./health";

test("health answers 200 when the database responds", async () => {
  assert.deepEqual(await checkHealth(async () => 1), { status: 200, body: { ok: true } });
});

test("health answers 503 without details when the database fails", async () => {
  const result = await checkHealth(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5433 password=secret");
  });
  assert.deepEqual(result, { status: 503, body: { ok: false } });
});

test("health answers 503 when the database hangs", async () => {
  const result = await checkHealth(() => new Promise(() => {}), 20);
  assert.deepEqual(result, { status: 503, body: { ok: false } });
});
