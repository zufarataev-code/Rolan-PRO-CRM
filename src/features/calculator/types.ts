export type CalculatorFieldConfig = {
  service_field_config_id: string;
  service_type_id: string;
  field_key: string;
  field_label_ru: string;
  field_label_en: string;
  input_type: string;
  data_type: string;
  dropdown_source: string | null;
  is_required: boolean;
  sort_order: number;
  default_value?: {
    options?: Array<{
      value: string;
      label_ru: string;
      label_en: string;
    }>;
  } | null;
};

export type CalculatorAddon = {
  service_addon_id: string;
  service_type_id: string;
  addon_code: string;
  name_ru: string;
  name_en: string;
  unit_type: string;
  default_price: number;
  min_price: number;
  cost_price: number;
  sort_order: number;
};

export type CalculatorFilm = {
  film_id: string;
  category_code: string;
  category_name_ru: string;
  category_name_en: string;
  brand_code: string;
  brand_name_ru: string;
  brand_name_en: string;
  model_code: string;
  model_name_ru: string;
  model_name_en: string;
  thickness: string | null;
};

export type CalculatorServiceType = {
  service_type_id: string;
  service_code: string;
  name_ru: string;
  name_en: string;
  unit_type: string;
  base_price: number;
  min_price: number;
  block_revenue_price: number;
  material_cost_per_sqft: number;
  installation_cost_per_sqft: number;
  block_cost_price: number;
};

export type CalculatorCardAddon = {
  id: string;
  service_addon_id: string | null;
  addon_code: string | null;
  name_ru: string | null;
  name_en: string | null;
  unit_type: string | null;
  quantity: number | null;
  unit_price_override: number | null;
  manual_label: string | null;
};

export type CalculatorCardPricing = {
  service_unit_price_override: number | null;
  block_unit_price_override: number | null;
};

export type CalculatorCard = {
  id: string;
  service_type_id: string | null;
  selected_category_code: string | null;
  selected_brand_code: string | null;
  film_id: string | null;
  dynamic_fields: Record<string, string | number | boolean | null>;
  pricing: CalculatorCardPricing;
  addons: CalculatorCardAddon[];
  notes: string;
};

export type CalculatorBootstrap = {
  service_types: CalculatorServiceType[];
  service_field_config: CalculatorFieldConfig[];
  service_addons: CalculatorAddon[];
  film_catalog: CalculatorFilm[];
};

export type CalculatorLineBreakdown = {
  label: string;
  amount: number;
};

export type CalculatorLineResult = {
  film_revenue: number;
  block_revenue: number;
  addons_total: number;
  revenue_subtotal: number;
  line_total: number;
  service_unit_price: number;
  service_min_price: number;
  block_unit_price: number;
  below_minimum_warning: boolean;
  warnings: string[];
  breakdown: CalculatorLineBreakdown[];
};

export type CalculatorSummaryItem = {
  id: string;
  service_name: string;
  total: number;
};

export type CalculatorSummary = {
  line_items: CalculatorSummaryItem[];
  subtotal: number;
  total: number;
};

export type CalculatorEconomicsResult = {
  quoted_revenue: number;
  material_cost_total: number;
  installation_cost_total: number;
  block_cost_total: number;
  addon_cost_total: number;
  estimated_cost_total: number;
  estimated_profit: number;
  estimated_margin_percent: number;
  billable_sqft: number;
  actual_film_sqft: number;
  blocks_qty: number;
};

export type CalculatorEconomicsSummaryItem = {
  id: string;
  service_name: string;
  quoted_revenue: number;
  estimated_cost_total: number;
  estimated_profit: number;
  estimated_margin_percent: number;
};

export type CalculatorEconomicsSummary = {
  line_items: CalculatorEconomicsSummaryItem[];
  quoted_revenue_total: number;
  estimated_cost_total: number;
  estimated_profit_total: number;
  estimated_margin_percent: number;
};
