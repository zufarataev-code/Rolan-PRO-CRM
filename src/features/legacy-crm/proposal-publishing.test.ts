import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("legacy proposal publishing uses the canonical public route", () => {
  const urlFunction = legacyCrm.match(/function premiumProposalUrl[\s\S]*?\n}/)?.[0] || "";
  assert.match(urlFunction, /\/proposal\//);
  assert.doesNotMatch(urlFunction, /#\/proposal\//);
});

test("legacy proposal email is sent by the authenticated Gmail API route", () => {
  const managerModal = legacyCrm.match(/function openPremiumProposalManagerModal[\s\S]*?\n}/)?.[0] || "";
  assert.match(managerModal, /premiumSendCanonicalProposal/);
  assert.doesNotMatch(managerModal, /emailLink\(client\.email/);
  assert.match(legacyCrm, /\/api\/v1\/proposals\/\$\{encodeURIComponent\(published\.proposal_id\)\}\/send/);
});
