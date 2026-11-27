import assert from "node:assert/strict";
import test from "node:test";

import { buildProposalEmail, buildProposalSms } from "./email";

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

test("the SMS / WhatsApp text carries the link, the approve step and the office phone", () => {
  const en = buildProposalSms({ clientName: "Trace Newport", proposalCode: "PRC-75", proposalTitle: "Smart film", publicUrl: "https://crm.example/proposal/pp_x" });
  assert.equal(en, "Hi Trace, your Rolan PRO proposal PRC-75 is ready: https://crm.example/proposal/pp_x — pick the services and tap Approve. Questions? Call (424) 325-0512.");
  const ru = buildProposalSms({ clientName: null, proposalCode: null, proposalTitle: "Смарт", publicUrl: "https://crm.example/proposal/pp_y", language: "ru" });
  assert.ok(ru.startsWith("Здравствуйте! Ваше предложение Rolan PRO Смарт: https://crm.example/proposal/pp_y"));
  assert.ok(ru.length < 320);
});
