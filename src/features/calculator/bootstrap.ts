import { prisma } from "@/lib/db";
import type { CalculatorBootstrap } from "@/features/calculator/types";

function toNumber(value: { toString(): string }) {
  return Number(value.toString());
}

export async function getServiceCalculatorBootstrap(): Promise<CalculatorBootstrap> {
  const serviceCodes = ["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM"];
  const salesFieldKeysToHide = ["complexity_level_id", "actual_film_sqft", "extra_costs"];

  const [serviceTypes, fieldConfigs, addons, films] = await Promise.all([
    prisma.serviceType.findMany({
      where: {
        is_active: true,
        service_code: {
          in: serviceCodes,
        },
      },
      orderBy: {
        sort_order: "asc",
      },
    }),
    prisma.serviceFieldConfig.findMany({
      where: {
        is_active: true,
        field_key: {
          notIn: salesFieldKeysToHide,
        },
        service_type: {
          service_code: {
            in: serviceCodes,
          },
        },
      },
      orderBy: [{ service_type: { sort_order: "asc" } }, { sort_order: "asc" }],
    }),
    prisma.serviceAddon.findMany({
      where: {
        is_active: true,
        service_type: {
          service_code: {
            in: serviceCodes,
          },
        },
      },
      orderBy: [{ service_type: { sort_order: "asc" } }, { sort_order: "asc" }],
    }),
    prisma.filmCatalog.findMany({
      where: {
        is_active: true,
        category_code: {
          in: ["SMART", "SOLAR", "SAFETY"],
        },
      },
      orderBy: [{ category_code: "asc" }, { brand_code: "asc" }, { model_code: "asc" }],
    }),
  ]);

  return {
    service_types: serviceTypes.map((serviceType) => ({
      service_type_id: serviceType.service_type_id,
      service_code: serviceType.service_code,
      name_ru: serviceType.name_ru,
      name_en: serviceType.name_en,
      unit_type: serviceType.unit_type,
      base_price: toNumber(serviceType.base_price),
      min_price: toNumber(serviceType.min_price),
      block_revenue_price: toNumber(serviceType.block_revenue_price),
      material_cost_per_sqft: toNumber(serviceType.material_cost_per_sqft),
      installation_cost_per_sqft: toNumber(serviceType.installation_cost_per_sqft),
      block_cost_price: toNumber(serviceType.block_cost_price),
    })),
    service_field_config: fieldConfigs.map((field) => ({
      service_field_config_id: field.service_field_config_id,
      service_type_id: field.service_type_id,
      field_key: field.field_key,
      field_label_ru: field.field_label_ru,
      field_label_en: field.field_label_en,
      input_type: field.input_type,
      data_type: field.data_type,
      dropdown_source: field.dropdown_source,
      is_required: field.is_required,
      sort_order: field.sort_order,
      default_value:
        field.default_value && typeof field.default_value === "object"
          ? (field.default_value as CalculatorBootstrap["service_field_config"][number]["default_value"])
          : null,
    })),
    service_addons: addons.map((addon) => ({
      service_addon_id: addon.service_addon_id,
      service_type_id: addon.service_type_id,
      addon_code: addon.addon_code,
      name_ru: addon.name_ru,
      name_en: addon.name_en,
      unit_type: addon.unit_type,
      default_price: toNumber(addon.default_price),
      min_price: toNumber(addon.min_price),
      cost_price: toNumber(addon.cost_price),
      sort_order: addon.sort_order,
    })),
    film_catalog: films.map((film) => ({
      film_id: film.film_id,
      category_code: film.category_code,
      category_name_ru: film.category_name_ru,
      category_name_en: film.category_name_en,
      brand_code: film.brand_code,
      brand_name_ru: film.brand_name_ru,
      brand_name_en: film.brand_name_en,
      model_code: film.model_code,
      model_name_ru: film.model_name_ru,
      model_name_en: film.model_name_en,
      thickness: film.thickness,
    })),
  };
}

export function withoutInternalCalculatorCosts(bootstrap: CalculatorBootstrap): CalculatorBootstrap {
  return {
    ...bootstrap,
    service_types: bootstrap.service_types.map((serviceType) => ({
      ...serviceType,
      material_cost_per_sqft: 0,
      installation_cost_per_sqft: 0,
      block_cost_price: 0,
    })),
    service_addons: bootstrap.service_addons.map((addon) => ({
      ...addon,
      cost_price: 0,
    })),
  };
}
