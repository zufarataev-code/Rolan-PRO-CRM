import assert from "node:assert/strict";
import { test } from "node:test";

import { allFramesSaved } from "./logout";

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
