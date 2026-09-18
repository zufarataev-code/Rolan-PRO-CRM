import assert from "node:assert/strict";
import test from "node:test";

import {
  GoogleAdsSettingsValidationError,
  normalizeQualificationPipelineStatus,
  readQualificationStageFromRules,
} from "./settings";

test("qualification stage accepts only known CRM pipeline stages", () => {
  assert.equal(normalizeQualificationPipelineStatus(" contacted "), "CONTACTED");
  assert.equal(normalizeQualificationPipelineStatus("CONSULTATION_SCHEDULED"), "CONSULTATION_SCHEDULED");
  assert.equal(normalizeQualificationPipelineStatus(null), null);

  assert.throws(
    () => normalizeQualificationPipelineStatus("MAGIC_QUALIFIED_STAGE"),
    (error: unknown) => {
      assert.ok(error instanceof GoogleAdsSettingsValidationError);
      assert.equal(error.code, "invalid_qualification_stage");
      return true;
    },
  );
});

test("qualification stage is read from the persisted JSON rule without inventing defaults", () => {
  assert.equal(readQualificationStageFromRules({ pipeline_status_code: "CONTACTED" }), "CONTACTED");
  assert.equal(readQualificationStageFromRules({}), null);
  assert.equal(readQualificationStageFromRules(null), null);
});
