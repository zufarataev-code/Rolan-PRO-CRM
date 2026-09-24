import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClosedWonTransactionId,
  buildQualifiedLeadTransactionId,
} from "./conversion-events";

test("qualified conversion keeps a stable deal transaction id", () => {
  assert.equal(buildQualifiedLeadTransactionId("deal-1"), "crm-deal-deal-1-qualified");
});
test("a booked lead can become a qualified conversion before a deal exists", () => {
  assert.equal(
    buildQualifiedLeadTransactionId({ leadId: "lead-1" }),
    "crm-lead-lead-1-qualified",
  );
});

test("closed-won conversion keeps a separate stable sale transaction id", () => {
  assert.equal(buildClosedWonTransactionId("deal-1"), "crm-deal-deal-1-sale");
});
