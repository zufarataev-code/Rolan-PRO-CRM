import assert from "node:assert/strict";
import test from "node:test";

test("difficulty multiplies the whole client price; a snapshotted old coefficient wins", async () => {
  const { calculatePositionFinance } = await import("./service");
  const position = {
    dynamic_fields: { sqft: 100, blocks_qty: 1, complexity_multiplier: 1.3 },
    actual_price: 10,
    min_price: 0,
    complexity_level: { multiplier: 2 },
    service_type: {
      service_code: "SMART_FILM",
      installation_cost_per_sqft: 5,
      block_revenue_price: 200,
      block_cost_price: 0,
      material_cost_per_sqft: 0,
    },
    position_addons: [
      { quantity: 1, unit_price: 100, total_price: 100, service_addon: { name_ru: "x", min_price: 0, cost_price: 0, unit_type: "fixed" } },
    ],
  } as never;
  const finance = calculatePositionFinance(position, { zoneInstallerRate: 50 });
  assert.equal(finance.complexity_multiplier, 1.3);
  assert.equal(finance.revenue_subtotal, 1690); // (1000 + 200 + 100) × 1.3
});
