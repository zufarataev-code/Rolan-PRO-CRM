import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyHtml = readFileSync(
  new URL("../../../private/legacy/rolanpro-crm-cloud.html", import.meta.url),
  "utf8",
);

test("does not ship the historical Wiz customer export in the legacy bundle", () => {
  assert.match(legacyHtml, /const WIZ_BOOTSTRAP_DATA = \[\];/);
  assert.doesNotMatch(legacyHtml, /const WIZ_BOOTSTRAP_DATA = \[\{/);
});
