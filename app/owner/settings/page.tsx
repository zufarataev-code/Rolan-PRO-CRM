import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { OwnerSettingsEditor } from "@/components/owner-settings-editor";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { requireAppSession } from "@/lib/auth/app-session";
import { getCompanyOverheadRows, readCompanyOverheadConfig } from "@/lib/finance/company-overhead";
import { getSettingsBootstrap } from "@/lib/reference/bootstrap";

export default async function OwnerSettingsPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const [settings, companyOverheadConfig] = await Promise.all([getSettingsBootstrap("ru"), readCompanyOverheadConfig()]);

  return (
    <OwnerShell
      title="Настройки и справочники"
      subtitle="Цены, активные услуги, каталог пленок, зоны обслуживания и системные параметры."
      kicker="Система / Настройки"
      activeHref="/owner/settings"
    >
      <OwnerSettingsEditor
        serviceTypes={settings.service_types.map((item) => ({
          service_type_id: item.service_type_id,
          service_code: item.service_code,
          name_ru: item.name_ru,
          unit_type: item.unit_type,
          base_price: Number(item.base_price),
          min_price: Number(item.min_price),
          block_revenue_price: Number(item.block_revenue_price),
          material_cost_per_sqft: Number(item.material_cost_per_sqft),
          installation_cost_per_sqft: Number(item.installation_cost_per_sqft),
          block_cost_price: Number(item.block_cost_price),
          is_active: item.is_active,
          sort_order: item.sort_order,
        }))}
        serviceAddons={settings.service_addons.map((item) => ({
          service_addon_id: item.service_addon_id,
          service_type_id: item.service_type_id,
          addon_code: item.addon_code,
          name_ru: item.name_ru,
          unit_type: item.unit_type,
          default_price: Number(item.default_price),
          min_price: Number(item.min_price),
          cost_price: Number(item.cost_price),
          is_active: item.is_active,
          sort_order: item.sort_order,
        }))}
        filmCatalog={settings.film_catalog.map((item) => ({
          film_id: item.film_id,
          category_name_ru: item.category_name_ru,
          brand_name_ru: item.brand_name_ru,
          model_name_ru: item.model_name_ru,
          thickness: item.thickness,
          unit: item.unit,
          is_active: item.is_active,
          sort_order: item.sort_order,
        }))}
        complexityLevels={settings.complexity_levels.map((item) => ({
          complexity_level_id: item.complexity_level_id,
          level_code: item.level_code,
          name_ru: item.name_ru,
          numeric_rank: item.numeric_rank,
          multiplier: Number(item.multiplier),
          is_active: item.is_active,
          sort_order: item.sort_order,
        }))}
        cities={settings.cities.map((item) => ({
          city_id: item.city_id,
          city_code: item.city_code,
          name_ru: item.name_ru,
          state_code: item.state_code,
          default_zip_code: item.default_zip_code,
          is_active: item.is_active,
          sort_order: item.sort_order,
        }))}
        companyOverhead={getCompanyOverheadRows(companyOverheadConfig).map((item) => ({
          key: item.key,
          label_ru: item.label_ru,
          description_ru: item.description_ru,
          monthly_amount: item.monthly_amount,
        }))}
      />
    </OwnerShell>
  );
}
