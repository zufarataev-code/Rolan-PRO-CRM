import assert from "node:assert/strict";
import test from "node:test";
import { contactTagStage, LEAD_CONTACT_TAGS, LEAD_STAGES, leadOutcomeStage, validateLeadContactTag, validateManualLeadStage } from "./lead-stages";
import { normalizeQualificationPipelineStatus } from "../google-ads/settings";

test("manual stages cover contact, qualification and negative outcomes without forging workflow evidence", () => {
  for (const code of ["NEW_LEAD", "CONTACTING", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CLOSED_LOST", "SPAM"]) {
    assert.equal(validateManualLeadStage(code, "Fixture reason"), null, code);
  }
  for (const code of ["CLOSED_WON", "PROJECT_CREATED", "PROPOSAL_SENT", "CONSULTATION_SCHEDULED", "DEPOSIT_PAID", "unknown", null, {}]) {
    assert.ok(validateManualLeadStage(code, "Fixture"));
  }
  for (const code of ["DISQUALIFIED", "CLOSED_LOST", "SPAM"]) assert.ok(validateManualLeadStage(code, "  "));
  assert.ok(validateManualLeadStage("QUALIFIED", "x".repeat(501)));
  assert.equal(normalizeQualificationPipelineStatus("qualified"), "QUALIFIED");
  assert.throws(() => normalizeQualificationPipelineStatus("CLOSED_LOST"));
  assert.equal(LEAD_STAGES.find(stage => stage.code === "CLOSED_WON")?.manual, false);
});

test("converted requires a positive recorded sale and respects retraction", () => {
  assert.equal(leadOutcomeStage([]), null);
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [] }]), "CLOSED_WON");
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [{ adjustment_type: "RESTATEMENT" }] }]), "CLOSED_WON");
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [{ adjustment_type: "RETRACTION" }] }]), "CLOSED_LOST");
  assert.equal(leadOutcomeStage([{ conversion_value: null, adjustments: [] }]), null);
  assert.equal(leadOutcomeStage([{ conversion_value: "0.00", adjustments: [] }]), null);
});

test("contact tag accepts the three call outcomes and null, nothing else", () => {
  assert.deepEqual(LEAD_CONTACT_TAGS.map(tag => tag.code), ["REACHED", "NOT_REACHED", "WRONG_PHONE"]);
  for (const tag of ["REACHED", "NOT_REACHED", "WRONG_PHONE", null]) assert.equal(validateLeadContactTag(tag), null, String(tag));
  for (const tag of ["reached", "", undefined, 1, {}, "QUALIFIED"]) assert.ok(validateLeadContactTag(tag), String(tag));
});

test("a call outcome moves only a first-contact lead, and never backwards or out of the workflow", () => {
  assert.equal(contactTagStage("REACHED", "NEW_LEAD"), "CONTACTED");
  assert.equal(contactTagStage("REACHED", "CONTACTING"), "CONTACTED");
  assert.equal(contactTagStage("REACHED", "CONTACTED"), null);
  assert.equal(contactTagStage("NOT_REACHED", "NEW_LEAD"), "CONTACTING");
  assert.equal(contactTagStage("NOT_REACHED", "CONTACTING"), null);
  assert.equal(contactTagStage("NOT_REACHED", "CONTACTED"), null);
  assert.equal(contactTagStage("WRONG_PHONE", "NEW_LEAD"), null);
  for (const stage of ["QUALIFIED", "PROJECT_CREATED", "PROPOSAL_SENT", "CLOSED_WON", "CLOSED_LOST", "SPAM"]) {
    assert.equal(contactTagStage("REACHED", stage), null, stage);
    assert.equal(contactTagStage("NOT_REACHED", stage), null, stage);
  }
  assert.equal(contactTagStage(null, "NEW_LEAD"), null);
});
