import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("new project: found contacts open inside the window instead of being cut off by it", () => {
  // The intake body scrolls (overflow-y: auto); a floating list inside it is clipped
  // while only step 1 is shown, so the owner could not see or pick the contact.
  const results = legacyCrm.match(/<div id="no-client-results" class="([^"]*)"/);
  assert.ok(results, "the contact results list exists");
  assert.doesNotMatch(results[1], /\babsolute\b/);
  assert.match(results[1], /max-h-60 overflow-y-auto/);
});

test("owner's «Ожидают оплаты» opens the list instead of «Нет данных»", () => {
  const ownerBranch = legacyCrm.slice(
    legacyCrm.indexOf("if (u.role === 'manager' || u.role === 'owner') {", legacyCrm.indexOf("function renderView()")),
    legacyCrm.indexOf("} else if (u.role === 'measurer') {", legacyCrm.indexOf("function renderView()")),
  );
  assert.match(ownerBranch, /case 'paymentsdue': return u\.role === 'owner' \? renderPaymentsDue\(\)/);
});
