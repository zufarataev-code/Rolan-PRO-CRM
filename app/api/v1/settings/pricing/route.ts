import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  getBusinessPlanningSnapshot,
  updateBusinessPlanningSettings,
  withoutInternalPlanningCosts,
} from "@/lib/finance/business-planning";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { addonPricingForRole, servicePricingForRole } from "@/lib/reference/pricing-visibility";

const PRICING_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeCode(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function codeListValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => textValue(item)).filter(Boolean).map((item) => normalizeCode(item));
}

function numberListValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  return [...new Set(list)].sort((a, b) => a - b);
}

function filmClassValue(value: unknown) {
  const text = textValue(value).toLowerCase();
  return text === "standard" || text === "premium" ? text : undefined;
}

function isOwner(roles: string[]) {
  return roles.includes(ROLE_CODES.OWNER);
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PRICING_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Pricing access denied.");
  }

  const [services, addons, films, accessLevels, planning] = await Promise.all([
    prisma.serviceType.findMany({ orderBy: [{ sort_order: "asc" }, { name_ru: "asc" }] }),
    prisma.serviceAddon.findMany({ orderBy: [{ sort_order: "asc" }, { name_ru: "asc" }] }),
    prisma.filmCatalog.findMany({
      orderBy: [{ category_code: "asc" }, { sort_order: "asc" }, { model_name_ru: "asc" }],
      select: {
        film_id: true, category_code: true, brand_code: true, brand_name_ru: true, model_code: true, model_name_ru: true,
        film_type_code: true, film_class: true, price_per_sqft: true, min_price_per_sqft: true, max_price_per_sqft: true,
        roll_widths_in: true, cutting_margin_in: true, vlt_percent: true, is_active: true, sort_order: true,
      },
    }),
    prisma.accessLevel.findMany({ orderBy: [{ sort_order: "asc" }] }),
    getBusinessPlanningSnapshot(),
  ]);

  const owner = isOwner(auth.session.roles);
  return apiSuccess({
    services: services.map((service) => servicePricingForRole(service, owner)),
    addons: addons.map((addon) => addonPricingForRole(addon, owner)),
    films,
    access_levels: accessLevels,
    planning: owner ? planning : withoutInternalPlanningCosts(planning),
    can_view_costs: owner,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PRICING_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Pricing update denied.");
  }

  const body = asRecord(await request.json().catch(() => null));
  const entity = textValue(body?.entity);
  const values = asRecord(body?.values);
  if (!values) return apiError(400, "invalid_payload", "values are required.");

  try {
    if (entity === "service_type") {
      const nameRu = textValue(values.name_ru);
      const code = normalizeCode(values.service_code || nameRu);
      if (!nameRu || !code) return apiError(400, "invalid_payload", "Название и код услуги обязательны.");

      const created = await prisma.serviceType.create({
        data: {
          service_code: code,
          name_ru: nameRu,
          name_en: textValue(values.name_en) || nameRu,
          unit_type: textValue(values.unit_type) || "sqft",
          base_price: numberValue(values.base_price) ?? 0,
          min_price: numberValue(values.min_price) ?? 0,
          block_revenue_price: numberValue(values.block_revenue_price) ?? 0,
          material_cost_per_sqft: isOwner(auth.session.roles)
            ? numberValue(values.material_cost_per_sqft) ?? 0
            : 0,
          installation_cost_per_sqft: isOwner(auth.session.roles)
            ? numberValue(values.installation_cost_per_sqft) ?? 0
            : 0,
          block_cost_price: isOwner(auth.session.roles) ? numberValue(values.block_cost_price) ?? 0 : 0,
          is_active: true,
          sort_order: integerValue(values.sort_order) ?? 100,
        },
      });
      return apiSuccess(created);
    }

    if (entity === "service_addon") {
      const nameRu = textValue(values.name_ru);
      const code = normalizeCode(values.addon_code || nameRu);
      const serviceTypeId = textValue(values.service_type_id);
      if (!nameRu || !code || !serviceTypeId) {
        return apiError(400, "invalid_payload", "Услуга, название и код допуслуги обязательны.");
      }
      const created = await prisma.serviceAddon.create({
        data: {
          service_type_id: serviceTypeId,
          addon_code: code,
          name_ru: nameRu,
          name_en: textValue(values.name_en) || nameRu,
          unit_type: textValue(values.unit_type) || "item",
          default_price: numberValue(values.default_price) ?? 0,
          min_price: numberValue(values.min_price) ?? 0,
          cost_price: isOwner(auth.session.roles) ? numberValue(values.cost_price) ?? 0 : 0,
          is_active: true,
          sort_order: integerValue(values.sort_order) ?? 100,
        },
      });
      return apiSuccess(created);
    }
  } catch {
    return apiError(409, "pricing_conflict", "Такой код уже существует или данные заполнены неверно.");
  }

  return apiError(400, "unsupported_entity", "Этот тип записи не поддерживается.");
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, PRICING_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Pricing update denied.");
  }

  const body = asRecord(await request.json().catch(() => null));
  const entity = textValue(body?.entity);
  const id = textValue(body?.id);
  const patch = asRecord(body?.patch);
  if (!patch) return apiError(400, "invalid_payload", "patch is required.");

  if (entity === "planning") {
    if (!isOwner(auth.session.roles)) return apiError(403, "forbidden", "План компании меняет только владелец.");
    await updateBusinessPlanningSettings(patch);
    return apiSuccess(await getBusinessPlanningSnapshot());
  }

  if (!id) return apiError(400, "invalid_payload", "id is required.");

  if (entity === "service_type") {
    const owner = isOwner(auth.session.roles);
    const updated = await prisma.serviceType.update({
      where: { service_type_id: id },
      data: {
        name_ru: optionalText(patch.name_ru),
        name_en: optionalText(patch.name_en),
        unit_type: optionalText(patch.unit_type),
        base_price: numberValue(patch.base_price),
        min_price: numberValue(patch.min_price),
        block_revenue_price: numberValue(patch.block_revenue_price),
        material_cost_per_sqft: owner ? numberValue(patch.material_cost_per_sqft) : undefined,
        installation_cost_per_sqft: owner ? numberValue(patch.installation_cost_per_sqft) : undefined,
        block_cost_price: owner ? numberValue(patch.block_cost_price) : undefined,
        is_active: booleanValue(patch.is_active),
        sort_order: integerValue(patch.sort_order),
      },
    });
    return apiSuccess(servicePricingForRole(updated, owner));
  }

  if (entity === "service_addon") {
    const updated = await prisma.serviceAddon.update({
      where: { service_addon_id: id },
      data: {
        name_ru: optionalText(patch.name_ru),
        name_en: optionalText(patch.name_en),
        unit_type: optionalText(patch.unit_type),
        default_price: numberValue(patch.default_price),
        min_price: numberValue(patch.min_price),
        cost_price: isOwner(auth.session.roles) ? numberValue(patch.cost_price) : undefined,
        color_token: optionalText(patch.color_token),
        suggested_with_addon_codes: codeListValue(patch.suggested_with_addon_codes),
        is_active: booleanValue(patch.is_active),
        sort_order: integerValue(patch.sort_order),
      },
    });
    return apiSuccess(addonPricingForRole(updated, isOwner(auth.session.roles)));
  }

  // Плёнка: класс, тип, коридор цены за sq ft и рулоны для раскроя — всё, что нужно кассе.
  if (entity === "film") {
    const minPrice = numberValue(patch.min_price_per_sqft);
    const maxPrice = numberValue(patch.max_price_per_sqft);
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return apiError(400, "invalid_corridor", "Минимальная цена не может быть выше максимальной.");
    }
    const updated = await prisma.filmCatalog.update({
      where: { film_id: id },
      data: {
        film_type_code: optionalText(patch.film_type_code)?.toLowerCase(),
        film_class: filmClassValue(patch.film_class),
        price_per_sqft: numberValue(patch.price_per_sqft),
        min_price_per_sqft: minPrice,
        max_price_per_sqft: maxPrice,
        roll_widths_in: numberListValue(patch.roll_widths_in),
        cutting_margin_in: numberValue(patch.cutting_margin_in),
        is_active: booleanValue(patch.is_active),
        sort_order: integerValue(patch.sort_order),
      },
    });
    return apiSuccess(updated);
  }

  // Доступ к окну: коэффициент к монтажу и стоимость техники — только владелец.
  if (entity === "access_level") {
    if (!isOwner(auth.session.roles)) return apiError(403, "forbidden", "Коэффициенты доступа меняет только владелец.");
    const updated = await prisma.accessLevel.update({
      where: { access_level_id: id },
      data: {
        name_ru: optionalText(patch.name_ru),
        labor_coefficient: numberValue(patch.labor_coefficient),
        equipment_day_cost: numberValue(patch.equipment_day_cost),
        equipment_name_ru: optionalText(patch.equipment_name_ru),
        is_contractor: booleanValue(patch.is_contractor),
        is_active: booleanValue(patch.is_active),
        sort_order: integerValue(patch.sort_order),
      },
    });
    return apiSuccess(updated);
  }

  return apiError(400, "unsupported_entity", "Этот тип записи не поддерживается.");
}
