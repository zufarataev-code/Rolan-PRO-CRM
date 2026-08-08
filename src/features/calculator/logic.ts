import type {
  CalculatorAddon,
  CalculatorBootstrap,
  CalculatorCard,
  CalculatorFieldConfig,
  CalculatorCardAddon,
  CalculatorEconomicsResult,
  CalculatorEconomicsSummary,
  CalculatorLineBreakdown,
  CalculatorLineResult,
  CalculatorSummary,
  CalculatorServiceType,
} from "@/features/calculator/types";

const SERVICE_CATEGORY_MAP: Record<string, string[]> = {
  SMART_FILM: ["SMART"],
  SOLAR_FILM: ["SOLAR"],
  SAFETY_FILM: ["SAFETY"],
};

const SALES_VISIBLE_FIELD_KEYS_BY_SERVICE_CODE: Record<string, string[]> = {
  SMART_FILM: ["category", "brand", "model", "sqft", "zones_qty", "blocks_qty", "block_type"],
  SOLAR_FILM: ["category", "brand", "model", "sqft", "windows_qty"],
  SAFETY_FILM: ["category", "brand", "model", "thickness", "sqft", "windows_qty"],
};

const FILM_SERVICE_CODES = new Set(["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM"]);
const SALES_HIDDEN_FIELD_KEYS = new Set(["complexity_level_id", "actual_film_sqft", "extra_costs"]);
let localIdSequence = 0;

function createLocalId(prefix: string) {
  localIdSequence += 1;
  return `${prefix}-${localIdSequence}`;
}

function asNumber(value: string | number | boolean | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return 0;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function getServiceFields(
  fieldConfigs: CalculatorFieldConfig[],
  serviceTypes: CalculatorServiceType[],
  serviceTypeId: string | null,
) {
  if (!serviceTypeId) {
    return [];
  }

  const serviceType = getServiceTypeById(serviceTypes, serviceTypeId);
  const visibleKeys = serviceType?.service_code
    ? new Set(SALES_VISIBLE_FIELD_KEYS_BY_SERVICE_CODE[serviceType.service_code] ?? [])
    : null;

  return fieldConfigs
    .filter(
      (field) =>
        field.service_type_id === serviceTypeId &&
        !SALES_HIDDEN_FIELD_KEYS.has(field.field_key) &&
        (!visibleKeys || visibleKeys.has(field.field_key)),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getServiceAddons(addons: CalculatorAddon[], serviceTypeId: string | null) {
  if (!serviceTypeId) {
    return [];
  }

  return addons
    .filter((addon) => addon.service_type_id === serviceTypeId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getServiceAddonById(addons: CalculatorAddon[], serviceAddonId: string | null) {
  if (!serviceAddonId) {
    return null;
  }

  return addons.find((addon) => addon.service_addon_id === serviceAddonId) ?? null;
}

export function getServiceTypeById(serviceTypes: CalculatorServiceType[], serviceTypeId: string | null) {
  if (!serviceTypeId) {
    return null;
  }

  return serviceTypes.find((serviceType) => serviceType.service_type_id === serviceTypeId) ?? null;
}

export function getAllowedFilmCategoryCodes(serviceCode: string | null) {
  if (!serviceCode) {
    return [];
  }

  return SERVICE_CATEGORY_MAP[serviceCode] ?? [];
}

function getDefaultFilmCategoryCode(serviceCode: string | null) {
  return getAllowedFilmCategoryCodes(serviceCode)[0] ?? null;
}

export function createEmptyCard(bootstrap: CalculatorBootstrap): CalculatorCard {
  const defaultServiceType = bootstrap.service_types[0] ?? null;
  const defaultCategoryCode = getDefaultFilmCategoryCode(defaultServiceType?.service_code ?? null);

  return {
    id: createLocalId("card"),
    service_type_id: defaultServiceType?.service_type_id ?? null,
    selected_category_code: defaultCategoryCode,
    selected_brand_code: null,
    film_id: null,
    dynamic_fields: defaultCategoryCode
      ? {
          category: defaultCategoryCode,
        }
      : {},
    pricing: {
      service_unit_price_override: null,
      block_unit_price_override: null,
    },
    addons: [],
    notes: "",
  };
}

export function createCardForServiceType(
  bootstrap: CalculatorBootstrap,
  serviceTypeId: string | null,
  previousId?: string,
): CalculatorCard {
  const serviceType = getServiceTypeById(bootstrap.service_types, serviceTypeId);
  const defaultCategoryCode = getDefaultFilmCategoryCode(serviceType?.service_code ?? null);

  return {
    id: previousId ?? createLocalId("card"),
    service_type_id: serviceTypeId,
    selected_category_code: defaultCategoryCode,
    selected_brand_code: null,
    film_id: null,
    dynamic_fields: defaultCategoryCode
      ? {
          category: defaultCategoryCode,
        }
      : {},
    pricing: {
      service_unit_price_override: null,
      block_unit_price_override: null,
    },
    addons: [],
    notes: "",
  };
}

export function createAddonSelection(
  referenceAddon: CalculatorAddon | null,
  serviceSqft: number,
  previousId?: string,
): CalculatorCardAddon {
  return {
    id: previousId ?? createLocalId("addon"),
    service_addon_id: referenceAddon?.service_addon_id ?? null,
    addon_code: referenceAddon?.addon_code ?? null,
    name_ru: referenceAddon?.name_ru ?? null,
    name_en: referenceAddon?.name_en ?? null,
    unit_type: referenceAddon?.unit_type ?? null,
    quantity:
      referenceAddon?.unit_type === "sqft"
        ? serviceSqft || null
        : referenceAddon
          ? 1
          : null,
    unit_price_override: null,
    manual_label: referenceAddon?.addon_code === "OTHER" ? "" : null,
  };
}

export function getServiceLogicSummary(serviceCode: string | null) {
  switch (serviceCode) {
    case "SMART_FILM":
      return "Умная пленка: площадь, зоны, блоки управления и дополнительные услуги.";
    case "SOLAR_FILM":
      return "Солнцезащитная пленка: площадь, окна и дополнительные услуги.";
    case "SAFETY_FILM":
      return "Защитная пленка: толщина, площадь, окна и дополнительные услуги.";
    default:
      return "Выберите тип услуги, чтобы открыть нужные поля расчета.";
  }
}

function toMoney(value: number) {
  return Number(value.toFixed(2));
}

function resolveAddonQuantity(addon: CalculatorCardAddon, referenceAddon: CalculatorAddon) {
  if (addon.quantity !== null && addon.quantity !== undefined) {
    return addon.quantity;
  }

  return referenceAddon.unit_type === "fixed" ? 1 : 0;
}

export function calculateLineTotal(
  card: CalculatorCard,
  bootstrap: CalculatorBootstrap,
): CalculatorLineResult {
  const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);

  if (!serviceType) {
    return {
      film_revenue: 0,
      block_revenue: 0,
      addons_total: 0,
      revenue_subtotal: 0,
      line_total: 0,
      service_unit_price: 0,
      service_min_price: 0,
      block_unit_price: 0,
      below_minimum_warning: false,
      warnings: [],
      breakdown: [],
    };
  }

  const isFilmService = FILM_SERVICE_CODES.has(serviceType.service_code);
  const isSmartService = serviceType.service_code === "SMART_FILM";
  const isSolarService = serviceType.service_code === "SOLAR_FILM";
  const isSafetyService = serviceType.service_code === "SAFETY_FILM";
  const billableSqft = asNumber(card.dynamic_fields.sqft);
  const windowsQty = isSolarService || isSafetyService ? asNumber(card.dynamic_fields.windows_qty) : 0;
  const zonesQty = isSmartService ? asNumber(card.dynamic_fields.zones_qty) : 0;
  const blocksQty = isSmartService ? asNumber(card.dynamic_fields.blocks_qty) : 0;
  const thickness = typeof card.dynamic_fields.thickness === "string" ? card.dynamic_fields.thickness.trim() : "";
  const serviceUnitPrice =
    card.pricing.service_unit_price_override !== null && card.pricing.service_unit_price_override !== undefined
      ? card.pricing.service_unit_price_override
      : serviceType.base_price;
  const blockUnitPrice =
    card.pricing.block_unit_price_override !== null && card.pricing.block_unit_price_override !== undefined
      ? card.pricing.block_unit_price_override
      : serviceType.block_revenue_price;

  const breakdown: CalculatorLineBreakdown[] = [];
  const warnings: string[] = [];

  let filmRevenue = 0;
  let blockRevenue = 0;
  let addonsTotal = 0;

  if (billableSqft > 0 && isFilmService) {
    filmRevenue = billableSqft * serviceUnitPrice;
    breakdown.push({
      label: `Пленка · ${billableSqft} sqft × $${serviceUnitPrice.toFixed(2)}`,
      amount: filmRevenue,
    });
  } else if (billableSqft > 0) {
    filmRevenue = billableSqft * serviceUnitPrice;
    breakdown.push({
      label: `${serviceType.name_ru} · ${billableSqft} ${serviceType.unit_type} × $${serviceUnitPrice.toFixed(2)}`,
      amount: filmRevenue,
    });
  }

  if (windowsQty > 0) {
    breakdown.push({
      label: `Окна · ${windowsQty} шт.`,
      amount: 0,
    });
  }

  if (thickness && isSafetyService) {
    breakdown.push({
      label: `Толщина · ${thickness}`,
      amount: 0,
    });
  }

  if (serviceUnitPrice > 0 && serviceType.min_price > 0 && serviceUnitPrice < serviceType.min_price) {
    warnings.push(`Цена услуги ниже минимальной: $${serviceType.min_price.toFixed(2)}`);
  }

  if (isSmartService && blocksQty > 0 && blockUnitPrice > 0) {
    blockRevenue = blocksQty * blockUnitPrice;
    breakdown.push({
      label: `Блоки · ${blocksQty} × $${blockUnitPrice.toFixed(2)}`,
      amount: blockRevenue,
    });
  }

  if (isSmartService && zonesQty > 0) {
    breakdown.push({
      label: `Зоны · ${zonesQty} шт.`,
      amount: 0,
    });
  }

  const addonReferenceMap = Object.fromEntries(
    bootstrap.service_addons.map((addon) => [addon.service_addon_id, addon]),
  );

  for (const addon of card.addons.filter(
    (item): item is CalculatorCardAddon & { service_addon_id: string } => Boolean(item.service_addon_id),
  )) {
    const referenceAddon = addonReferenceMap[addon.service_addon_id];

    if (!referenceAddon) {
      continue;
    }

    const quantity = resolveAddonQuantity(addon, referenceAddon);
    const unitPrice =
      addon.unit_price_override !== null && addon.unit_price_override !== undefined
        ? addon.unit_price_override
        : referenceAddon.default_price;
    const amount = referenceAddon.addon_code === "OTHER" && quantity <= 0 ? unitPrice : quantity * unitPrice;

    addonsTotal += amount;

    if (unitPrice > 0 && referenceAddon.min_price > 0 && unitPrice < referenceAddon.min_price) {
      warnings.push(`${referenceAddon.name_ru} ниже минимальной цены: $${referenceAddon.min_price.toFixed(2)}`);
    }

    breakdown.push({
      label:
        referenceAddon.addon_code === "OTHER"
          ? addon.manual_label?.trim() || referenceAddon.name_ru
          : `${referenceAddon.name_ru} · ${quantity} ${referenceAddon.unit_type} × $${unitPrice.toFixed(2)}`,
      amount,
    });
  }
  const revenueSubtotal = filmRevenue + blockRevenue + addonsTotal;

  return {
    film_revenue: toMoney(filmRevenue),
    block_revenue: toMoney(blockRevenue),
    addons_total: toMoney(addonsTotal),
    revenue_subtotal: toMoney(revenueSubtotal),
    line_total: toMoney(revenueSubtotal),
    service_unit_price: toMoney(serviceUnitPrice),
    service_min_price: toMoney(serviceType.min_price),
    block_unit_price: toMoney(blockUnitPrice),
    below_minimum_warning: warnings.length > 0,
    warnings,
    breakdown: breakdown.map((item) => ({
      ...item,
      amount: toMoney(item.amount),
    })),
  };
}

export function calculateSummary(cards: CalculatorCard[], bootstrap: CalculatorBootstrap): CalculatorSummary {
  const lineItems = cards.map((card) => {
    const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);
    const total = calculateLineTotal(card, bootstrap);

    return {
      id: card.id,
      service_name: serviceType?.name_ru ?? "Услуга не выбрана",
      total: total.line_total,
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

  return {
    line_items: lineItems,
    subtotal: toMoney(subtotal),
    total: toMoney(subtotal),
  };
}

export function calculateLineEconomics(
  card: CalculatorCard,
  bootstrap: CalculatorBootstrap,
): CalculatorEconomicsResult {
  const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);
  const line = calculateLineTotal(card, bootstrap);

  if (!serviceType) {
    return {
      quoted_revenue: 0,
      material_cost_total: 0,
      installation_cost_total: 0,
      block_cost_total: 0,
      addon_cost_total: 0,
      estimated_cost_total: 0,
      estimated_profit: 0,
      estimated_margin_percent: 0,
      billable_sqft: 0,
      actual_film_sqft: 0,
      blocks_qty: 0,
    };
  }

  const isFilmService = FILM_SERVICE_CODES.has(serviceType.service_code);
  const billableSqft = asNumber(card.dynamic_fields.sqft);
  const actualFilmSqft = asNumber(card.dynamic_fields.actual_film_sqft) || billableSqft;
  const blocksQty = serviceType.service_code === "SMART_FILM" ? asNumber(card.dynamic_fields.blocks_qty) : 0;

  const addonReferenceMap = Object.fromEntries(
    bootstrap.service_addons.map((addon) => [addon.service_addon_id, addon]),
  );

  const addonCostTotal = card.addons.reduce((sum, addon) => {
    if (!addon.service_addon_id) {
      return sum;
    }

    const referenceAddon = addonReferenceMap[addon.service_addon_id];

    if (!referenceAddon) {
      return sum;
    }

    const quantity = resolveAddonQuantity(addon, referenceAddon);
    const effectiveQuantity = referenceAddon.addon_code === "OTHER" && quantity <= 0 ? 1 : quantity;
    return sum + effectiveQuantity * referenceAddon.cost_price;
  }, 0);

  const materialCostTotal = actualFilmSqft * serviceType.material_cost_per_sqft * (isFilmService ? 1 : 0);
  const installationCostTotal = actualFilmSqft * serviceType.installation_cost_per_sqft * (isFilmService ? 1 : 0);
  const blockCostTotal = blocksQty * serviceType.block_cost_price;
  const estimatedCostTotal = materialCostTotal + installationCostTotal + blockCostTotal + addonCostTotal;
  const estimatedProfit = line.line_total - estimatedCostTotal;
  const estimatedMarginPercent = line.line_total > 0 ? (estimatedProfit / line.line_total) * 100 : 0;

  return {
    quoted_revenue: toMoney(line.line_total),
    material_cost_total: toMoney(materialCostTotal),
    installation_cost_total: toMoney(installationCostTotal),
    block_cost_total: toMoney(blockCostTotal),
    addon_cost_total: toMoney(addonCostTotal),
    estimated_cost_total: toMoney(estimatedCostTotal),
    estimated_profit: toMoney(estimatedProfit),
    estimated_margin_percent: toMoney(estimatedMarginPercent),
    billable_sqft: toMoney(billableSqft),
    actual_film_sqft: toMoney(actualFilmSqft),
    blocks_qty: toMoney(blocksQty),
  };
}

export function calculateEconomicsSummary(
  cards: CalculatorCard[],
  bootstrap: CalculatorBootstrap,
): CalculatorEconomicsSummary {
  const lineItems = cards.map((card) => {
    const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);
    const economics = calculateLineEconomics(card, bootstrap);

    return {
      id: card.id,
      service_name: serviceType?.name_ru ?? "Услуга не выбрана",
      quoted_revenue: economics.quoted_revenue,
      estimated_cost_total: economics.estimated_cost_total,
      estimated_profit: economics.estimated_profit,
      estimated_margin_percent: economics.estimated_margin_percent,
    };
  });

  const quotedRevenueTotal = lineItems.reduce((sum, item) => sum + item.quoted_revenue, 0);
  const estimatedCostTotal = lineItems.reduce((sum, item) => sum + item.estimated_cost_total, 0);
  const estimatedProfitTotal = lineItems.reduce((sum, item) => sum + item.estimated_profit, 0);
  const estimatedMarginPercent =
    quotedRevenueTotal > 0 ? (estimatedProfitTotal / quotedRevenueTotal) * 100 : 0;

  return {
    line_items: lineItems,
    quoted_revenue_total: toMoney(quotedRevenueTotal),
    estimated_cost_total: toMoney(estimatedCostTotal),
    estimated_profit_total: toMoney(estimatedProfitTotal),
    estimated_margin_percent: toMoney(estimatedMarginPercent),
  };
}
