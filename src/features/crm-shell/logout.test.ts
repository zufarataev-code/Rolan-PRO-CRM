import assert from "node:assert/strict";
import { test } from "node:test";

import { allFramesSaved, signedOut } from "./logout";

test("«Выйти» goes on only after every working frame saved its edits", async () => {
  const seen: string[] = [];
  const save = async (frame: string) => {
    seen.push(frame);
    return frame !== "failed";
  };
  assert.equal(await allFramesSaved(["a", "b"], save), true);
  assert.equal(await allFramesSaved(["a", "failed", "b"], save), false);
  // It stops at the failed save and asks nothing more of later frames.
  assert.deepEqual(seen, ["a", "b", "a", "failed"]);
  assert.equal(await allFramesSaved([], save), true);
});

test("«Выйти» leaves only when the server ended the session", async () => {
  assert.equal(await signedOut(async () => ({ ok: true })), true);
  assert.equal(await signedOut(async () => ({ ok: false })), false);
  assert.equal(await signedOut(async () => { throw new Error("offline"); }), false);
});
