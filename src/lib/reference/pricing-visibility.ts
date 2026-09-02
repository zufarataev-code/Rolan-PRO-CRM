export function servicePricingForRole<T extends {
  material_cost_per_sqft: unknown;
  installation_cost_per_sqft: unknown;
  block_cost_price: unknown;
}>(service: T, canViewCosts: boolean) {
  return canViewCosts ? service : {
    ...service,
    material_cost_per_sqft: 0,
    installation_cost_per_sqft: 0,
    block_cost_price: 0,
  };
}

export function addonPricingForRole<T extends { cost_price: unknown }>(addon: T, canViewCosts: boolean) {
  return canViewCosts ? addon : { ...addon, cost_price: 0 };
}
