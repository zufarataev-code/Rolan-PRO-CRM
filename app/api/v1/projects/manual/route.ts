import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { createManualProject } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ROLE_CODES } from "@/lib/auth/constants";

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Manual project creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        client_name?: string;
        phone?: string | null;
        email?: string | null;
        city_id?: string | null;
        service_address?: string | null;
        zip_code?: string | null;
        project_title?: string;
        service_type_id?: string;
        film_id?: string | null;
        billable_sqft?: number | string;
        actual_film_sqft?: number | string | null;
        client_unit_price?: number | string | null;
        installation_cost_per_sqft?: number | string | null;
        extra_costs?: number | string | null;
        installer_id?: string | null;
        project_notes?: string | null;
        position_notes?: string | null;
      }
    | null;

  const billableSqft = asNumber(body?.billable_sqft);

  if (!body?.client_name?.trim() || !body?.project_title?.trim() || !body?.service_type_id || !body?.film_id || !billableSqft) {
    return apiError(
      400,
      "invalid_payload",
      "client_name, project_title, service_type_id, film_id and positive billable_sqft are required.",
    );
  }

  const canManageInternalEconomics = auth.session.roles.includes(ROLE_CODES.OWNER);
  const project = await createManualProject(auth.session, {
    client_name: body.client_name,
    phone: body.phone ?? null,
    email: body.email ?? null,
    city_id: body.city_id ?? null,
    service_address: body.service_address ?? null,
    zip_code: body.zip_code ?? null,
    project_title: body.project_title,
    service_type_id: body.service_type_id,
    film_id: body.film_id,
    billable_sqft: billableSqft,
    actual_film_sqft: asNumber(body.actual_film_sqft) ?? null,
    client_unit_price: asNumber(body.client_unit_price) ?? null,
    installation_cost_per_sqft: canManageInternalEconomics
      ? asNumber(body.installation_cost_per_sqft) ?? null
      : null,
    extra_costs: asNumber(body.extra_costs) ?? null,
    installer_id: body.installer_id ?? null,
    project_notes: body.project_notes ?? null,
    position_notes: body.position_notes ?? null,
  });

  if (project === "invalid_payload") {
    return apiError(400, "invalid_payload", "Project payload is incomplete.");
  }

  if (project === "missing_status_config") {
    return apiError(500, "missing_status_config", "Project status configuration is missing.");
  }

  if (project === "invalid_service") {
    return apiError(404, "invalid_service", "Selected service was not found.");
  }

  if (project === "invalid_film") {
    return apiError(404, "invalid_film", "Selected material was not found.");
  }

  if (project === "invalid_city") {
    return apiError(404, "invalid_city", "Selected city was not found.");
  }

  if (project === "invalid_installer") {
    return apiError(404, "invalid_installer", "Selected installer was not found.");
  }

  return apiSuccess({
    project,
    project_id: project.project_id,
  });
}
