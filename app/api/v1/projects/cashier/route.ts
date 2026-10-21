import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { parseCashierInput } from "@/features/projects/cashier-payload";
import { createCashierProject, loadCashierCatalog } from "@/features/projects/cashier-service";
import { ClientIdentityConflictError, ClientNotAccessibleError } from "@/features/sales/client-identity";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Справочники кассы: направления, плёнки с коридором, услуги с цветом и подсказками, доступ. */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Cashier access denied.");
  const bundle = await loadCashierCatalog();
  return apiSuccess({
    directions: bundle.directions,
    films: bundle.catalog.films,
    addons: bundle.catalog.addons,
    access_levels: bundle.catalog.access_levels ?? [],
    removal_rate_per_sqft: bundle.catalog.removal_rate_per_sqft,
  });
}

/** Создать проект из кассы. Ниже минимума — 422, проект не создаётся. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Cashier project creation denied.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseCashierInput(body);
  if (!parsed.ok) return apiError(400, "invalid_payload", "Cashier payload is invalid.", { errors: parsed.errors });

  const str = (key: string) => (typeof body?.[key] === "string" ? (body[key] as string) : null);
  let result: Awaited<ReturnType<typeof createCashierProject>>;
  try {
    result = await createCashierProject(auth.session, {
      ...parsed.input,
      client_id: str("client_id"),
      client_name: str("client_name"),
      phone: str("phone"),
      email: str("email"),
      city_id: str("city_id"),
      service_address: str("service_address"),
      zip_code: str("zip_code"),
      project_title: str("project_title"),
      site_type: body?.site_type === "COMMERCIAL" ? "COMMERCIAL" : body?.site_type === "RESIDENTIAL" ? "RESIDENTIAL" : null,
      manager_notes: str("manager_notes"),
      consultant_user_id: str("consultant_user_id"),
      installer_id: str("installer_id"),
    });
  } catch (error) {
    if (error instanceof ClientNotAccessibleError) return apiError(409, "client_owned_by_other_manager", error.message);
    if (error instanceof ClientIdentityConflictError) {
      const candidates = await prisma.client.findMany({ where: { client_id: { in: error.candidateIds } }, select: { client_id: true, name: true, phone: true, email: true } });
      return apiError(409, "client_identity_conflict", error.message, { email_client_id: error.emailClientId, phone_client_id: error.phoneClientId, candidates });
    }
    throw error;
  }

  if (!result.ok) {
    const status = result.reason === "below_minimum" ? 422 : result.reason === "missing_status_config" ? 500 : result.reason === "invalid_payload" ? 400 : 404;
    return apiError(status, result.reason, result.reason === "below_minimum" ? "Цена ниже минимума — продать нельзя." : "Cashier project could not be created.", { quote: result.quote });
  }
  return apiSuccess({ project_id: result.project_id, project_code: result.project_code, title: result.title, quote: result.quote });
}
