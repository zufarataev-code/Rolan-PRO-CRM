import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDataManagerRequestStatus } from "./request-status";

test("Data Manager request status waits while Google is processing", () => {
  assert.equal(
    summarizeDataManagerRequestStatus({
      requestStatusPerDestination: [{ requestStatus: "PROCESSING" }],
    }).state,
    "processing",
  );
});
test("Data Manager request status confirms only destination success", () => {
  assert.equal(
    summarizeDataManagerRequestStatus({
      requestStatusPerDestination: [{ requestStatus: "SUCCESS", warningInfo: { count: 1 } }],
    }).state,
    "success",
  );
});

test("Data Manager partial success requires operator review", () => {
  assert.equal(
    summarizeDataManagerRequestStatus({
      requestStatusPerDestination: [{ requestStatus: "PARTIAL_SUCCESS", errorInfo: { count: 1 } }],
    }).state,
    "partial_success",
  );
});
