import assert from "node:assert/strict";
import test from "node:test";

import { calculatePlanningTargets } from "@/lib/finance/business-planning";

test("calculates break-even and target lead plan from margin, check and conversion", () => {
  const result = calculatePlanningTargets({
    monthly_overhead: 10_000,
    target_profit_monthly: 50_000,
    gross_margin_percent: 50,
    average_deal_value: 5_000,
    lead_to_deal_percent: 25,
    proposal_revenue: 15_000,
  });

  assert.deepEqual(result.break_even, { revenue: 20_000, deals: 4, leads: 16 });
  assert.deepEqual(result.target, { revenue: 120_000, deals: 24, leads: 96 });
  assert.equal(result.progress_percent, 75);
  assert.equal(result.signal, "attention");
});

test("returns safe zeros when the economic assumptions are incomplete", () => {
  const result = calculatePlanningTargets({
    monthly_overhead: 10_000,
    target_profit_monthly: 50_000,
    gross_margin_percent: 0,
    average_deal_value: 0,
    lead_to_deal_percent: 0,
    proposal_revenue: 0,
  });

  assert.deepEqual(result.break_even, { revenue: 0, deals: 0, leads: 0 });
  assert.equal(result.signal, "risk");
});
