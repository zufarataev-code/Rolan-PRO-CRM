import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const legacyCrm = readFileSync(resolve("private/legacy/rolanpro-crm-cloud.html"), "utf8");

test("cloud save status cannot block SMS modal actions", () => {
  const statusStyle = legacyCrm.match(/node\.style\.cssText = '([^']+)'/)?.[1] ?? "";
  assert.match(statusStyle, /pointer-events:none/);
  assert.match(legacyCrm, /id="sms-send-button"/);
});
