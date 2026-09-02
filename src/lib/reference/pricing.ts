import { prisma } from "@/lib/db";
import { getBusinessPlanningSnapshot } from "@/lib/finance/business-planning";

export async function getServicePricingPageData() {
  const [services, addons, planning] = await Promise.all([
    prisma.serviceType.findMany({ orderBy: [{ sort_order: "asc" }, { name_ru: "asc" }] }),
    prisma.serviceAddon.findMany({ orderBy: [{ sort_order: "asc" }, { name_ru: "asc" }] }),
    getBusinessPlanningSnapshot(),
  ]);

  return {
    services: services.map((item) => ({
      service_type_id: item.service_type_id,
      service_code: item.service_code,
      name_ru: item.name_ru,
      name_en: item.name_en,
      unit_type: item.unit_type,
      base_price: Number(item.base_price),
      min_price: Number(item.min_price),
      block_revenue_price: Number(item.block_revenue_price),
      material_cost_per_sqft: Number(item.material_cost_per_sqft),
      installation_cost_per_sqft: Number(item.installation_cost_per_sqft),
      block_cost_price: Number(item.block_cost_price),
      is_active: item.is_active,
      sort_order: item.sort_order,
    })),
    addons: addons.map((item) => ({
      service_addon_id: item.service_addon_id,
      service_type_id: item.service_type_id,
      addon_code: item.addon_code,
      name_ru: item.name_ru,
      name_en: item.name_en,
      unit_type: item.unit_type,
      default_price: Number(item.default_price),
      min_price: Number(item.min_price),
      cost_price: Number(item.cost_price),
      is_active: item.is_active,
      sort_order: item.sort_order,
    })),
    planning,
  };
}
