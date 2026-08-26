import assert from "node:assert/strict";
import test from "node:test";

import { buildProposalEmail } from "./email";

test("proposal email uses the public client URL and explains PDF download", () => {
  const email = buildProposalEmail({
    clientName: "Taylor",
    proposalCode: "PRP-100",
    proposalTitle: "Window film proposal",
    publicUrl: "https://crm.example.com/proposal/public-token",
  });

  assert.match(email.subject, /PRP-100/);
  assert.match(email.body, /https:\/\/crm\.example\.com\/proposal\/public-token/);
  assert.match(email.body, /does not require access to the ROLANPRO CRM/);
  assert.match(email.body, /Download proposal/);
  assert.doesNotMatch(email.body, /legacy-crm/);
});
