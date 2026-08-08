import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: unknown) {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function parseString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

function parseNullableString(value: unknown) {
  if (value === null) {
    return null;
  }

  return parseString(value);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Reference update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        entity?: string;
        id?: string;
        patch?: Record<string, unknown>;
      }
    | null;

  if (!body?.entity || !body.id || !body.patch) {
    return apiError(400, "invalid_payload", "entity, id and patch are required.");
  }

  const patch = body.patch;

  switch (body.entity) {
    case "service_type": {
      const updated = await prisma.serviceType.update({
        where: {
          service_type_id: body.id,
        },
        data: {
          unit_type: parseString(patch.unit_type),
          base_price: parseNumber(patch.base_price),
          min_price: parseNumber(patch.min_price),
          block_revenue_price: parseNumber(patch.block_revenue_price),
          material_cost_per_sqft: parseNumber(patch.material_cost_per_sqft),
          installation_cost_per_sqft: parseNumber(patch.installation_cost_per_sqft),
          block_cost_price: parseNumber(patch.block_cost_price),
          is_active: parseBoolean(patch.is_active),
          sort_order: parseInteger(patch.sort_order),
        },
      });

      return apiSuccess(updated);
    }
    case "service_addon": {
      const updated = await prisma.serviceAddon.update({
        where: {
          service_addon_id: body.id,
        },
        data: {
          unit_type: parseString(patch.unit_type),
          default_price: parseNumber(patch.default_price),
          min_price: parseNumber(patch.min_price),
          cost_price: parseNumber(patch.cost_price),
          is_active: parseBoolean(patch.is_active),
          sort_order: parseInteger(patch.sort_order),
        },
      });

      return apiSuccess(updated);
    }
    case "film": {
      const updated = await prisma.filmCatalog.update({
        where: {
          film_id: body.id,
        },
        data: {
          category_name_ru: parseString(patch.category_name_ru),
          brand_name_ru: parseString(patch.brand_name_ru),
          model_name_ru: parseString(patch.model_name_ru),
          thickness: parseNullableString(patch.thickness),
          unit: parseString(patch.unit),
          is_active: parseBoolean(patch.is_active),
          sort_order: parseInteger(patch.sort_order),
        },
      });

      return apiSuccess(updated);
    }
    case "complexity_level": {
      const updated = await prisma.complexityLevel.update({
        where: {
          complexity_level_id: body.id,
        },
        data: {
          name_ru: parseString(patch.name_ru),
          numeric_rank: parseInteger(patch.numeric_rank),
          multiplier: parseNumber(patch.multiplier),
          is_active: parseBoolean(patch.is_active),
          sort_order: parseInteger(patch.sort_order),
        },
      });

      return apiSuccess(updated);
    }
    case "city": {
      const updated = await prisma.city.update({
        where: {
          city_id: body.id,
        },
        data: {
          name_ru: parseString(patch.name_ru),
          state_code: parseNullableString(patch.state_code),
          default_zip_code: parseNullableString(patch.default_zip_code),
          is_active: parseBoolean(patch.is_active),
          sort_order: parseInteger(patch.sort_order),
        },
      });

      return apiSuccess(updated);
    }
    default:
      return apiError(400, "unsupported_entity", "This reference entity is not supported yet.");
  }
}
