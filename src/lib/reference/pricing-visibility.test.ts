import assert from "node:assert/strict";
import test from "node:test";

import { addonPricingForRole, servicePricingForRole } from "@/lib/reference/pricing-visibility";

test("manager pricing responses redact every owner-only service cost", () => {
  const result = servicePricingForRole({
    service_type_id: "service-1",
    base_price: 40,
    material_cost_per_sqft: 8,
    installation_cost_per_sqft: 5,
    block_cost_price: 25,
  }, false);

  assert.equal(result.base_price, 40);
  assert.equal(result.material_cost_per_sqft, 0);
  assert.equal(result.installation_cost_per_sqft, 0);
  assert.equal(result.block_cost_price, 0);
});

test("manager pricing responses redact add-on cost while owner keeps it", () => {
  const addon = { service_addon_id: "addon-1", default_price: 100, cost_price: 50 };
  assert.equal(addonPricingForRole(addon, false).cost_price, 0);
  assert.equal(addonPricingForRole(addon, true).cost_price, 50);
});
