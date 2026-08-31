import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const proposalCodeMigration = readFileSync(
  "prisma/migrations/20260831170000_sequential_proposal_codes/migration.sql",
  "utf8",
);

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

test("owner and manager have a proposal registry with real client views and order navigation", () => {
  assert.match(legacyCrm, /\['proposals', 'КП', '📄'\]/);
  assert.match(legacyCrm, /case 'proposals': return renderProposalsRegistry\(\)/);
  assert.match(legacyCrm, /fetch\('\/api\/v1\/proposals'/);
  assert.match(legacyCrm, /server\?\.client_viewed_at/);
  assert.match(legacyCrm, /В заказ →/);
  assert.match(legacyCrm, /openOrder\('\$\{record\.order\.id\}'\)/);
});

test("proposal numbers are immutable sequential PRC codes", () => {
  assert.match(proposalCodeMigration, /CREATE SEQUENCE IF NOT EXISTS "proposal_code_sequence"/);
  assert.match(proposalCodeMigration, /'PRC-' \|\| numbered\.proposal_number/);
  assert.match(proposalCodeMigration, /SET DEFAULT \('PRC-' \|\| nextval\('proposal_code_sequence'\)/);
  assert.match(legacyCrm, /record\.server\?\.proposal_code \|\| record\.local\?\.proposalCode/);
});
