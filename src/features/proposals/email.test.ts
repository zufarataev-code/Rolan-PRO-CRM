import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgreementSignedClientEmail,
  buildAgreementSignedManagerEmail,
  buildProposalEmail,
} from "./email";

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

test("signed agreement email confirms the signature to the client", () => {
  const email = buildAgreementSignedClientEmail({
    clientName: "Taylor",
    proposalCode: "PRP-100",
    proposalTitle: "Window film proposal",
    signerName: "Taylor Smith",
    signedAt: new Date("2026-10-25T20:00:00.000Z"),
    publicUrl: "https://crm.example.com/proposal/public-token",
    managerUrl: "https://crm.example.com/manager/crm/proposals/proposal-id",
  });

  assert.match(email.subject, /proposal signed/i);
  assert.match(email.body, /signed successfully/i);
  assert.match(email.body, /Taylor Smith/);
  assert.match(email.body, /https:\/\/crm\.example\.com\/proposal\/public-token/);
  assert.match(email.body, /download a PDF copy/i);
});

test("signed agreement email gives the manager a direct CRM link", () => {
  const email = buildAgreementSignedManagerEmail({
    clientName: "Taylor",
    proposalCode: "PRP-100",
    proposalTitle: "Window film proposal",
    signerName: "Taylor Smith",
    signedAt: new Date("2026-10-25T20:00:00.000Z"),
    publicUrl: "https://crm.example.com/proposal/public-token",
    managerUrl: "https://crm.example.com/manager/crm/proposals/proposal-id",
  });

  assert.match(email.subject, /Клиент подписал КП/);
  assert.match(email.body, /Taylor Smith/);
  assert.match(email.body, /https:\/\/crm\.example\.com\/manager\/crm\/proposals\/proposal-id/);
  assert.match(email.body, /КП принято/);
});
