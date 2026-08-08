import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES, CONSULTATION_MANAGER_ROLES } from "@/features/consultations/api";
import { createConsultation, listConsultationsForSession } from "@/features/consultations/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Consultation access denied.");
  }

  const items = await listConsultationsForSession(auth.session);

  return apiSuccess({
    items,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, CONSULTATION_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Consultation scheduling denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        assigned_consultant_id?: string;
        assigned_manager_id?: string | null;
        lead_id?: string | null;
        deal_id?: string | null;
        client_id?: string | null;
        project_id?: string | null;
        location_address?: string | null;
        manager_notes?: string | null;
        scheduled_start_at?: string;
        scheduled_end_at?: string;
      }
    | null;

  if (!body?.title?.trim() || !body.assigned_consultant_id || !body.scheduled_start_at || !body.scheduled_end_at) {
    return apiError(
      400,
      "invalid_payload",
      "Title, assigned consultant, scheduled start, and scheduled end are required.",
    );
  }

  const consultation = await createConsultation(auth.session.user.user_id, {
    title: body.title,
    assigned_consultant_id: body.assigned_consultant_id,
    assigned_manager_id: body.assigned_manager_id,
    lead_id: body.lead_id,
    deal_id: body.deal_id,
    client_id: body.client_id,
    project_id: body.project_id,
    location_address: body.location_address,
    manager_notes: body.manager_notes,
    scheduled_start_at: body.scheduled_start_at,
    scheduled_end_at: body.scheduled_end_at,
  }).catch((error) => {
    return {
      error,
    };
  });

  if ("error" in consultation) {
    return apiError(500, "consultation_create_failed", consultation.error.message);
  }

  return apiSuccess({
    consultation_id: consultation.consultation_id,
  });
}
