import assert from "node:assert/strict";
import test from "node:test";
import { LEAD_STAGES, leadOutcomeStage, validateManualLeadStage } from "./lead-stages";
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
  assert.equal(LEAD_STAGES.find(stage => stage.code === "CLOSED_WON")?.manual, false);
});

test("converted requires a positive recorded sale and respects retraction", () => {
  assert.equal(leadOutcomeStage([]), null);
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [] }]), "CLOSED_WON");
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [{ adjustment_type: "RESTATEMENT" }] }]), "CLOSED_WON");
  assert.equal(leadOutcomeStage([{ conversion_value: "250.00", adjustments: [{ adjustment_type: "RETRACTION" }] }]), "CLOSED_LOST");
  assert.equal(leadOutcomeStage([{ conversion_value: null, adjustments: [] }]), "CLOSED_LOST");
});
