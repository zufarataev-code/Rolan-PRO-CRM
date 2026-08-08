import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { addMeasurement, getConsultationByIdForSession } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Measurements access denied.");
  }

  const { consultationId } = await context.params;
  const consultation = await getConsultationByIdForSession(auth.session, consultationId);

  if (!consultation?.survey) {
    return apiError(404, "not_found", "Survey was not found.");
  }

  return apiSuccess({
    items: consultation.survey.measurements,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Measurement create denied.");
  }

  const { consultationId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        room_name?: string;
        office_name?: string | null;
        zone_name?: string | null;
        floor?: string | null;
        window_id?: string | null;
        width?: number | null;
        height?: number | null;
        sqft?: number | null;
        quantity?: number | null;
        glass_type?: string | null;
        orientation?: string | null;
        access_type?: string | null;
        complexity_level_id?: string | null;
        notes?: string | null;
        drawing_data?: Prisma.InputJsonValue | null;
        sort_order?: number;
      }
    | null;

  if (!body?.room_name?.trim()) {
    return apiError(400, "invalid_payload", "room_name is required.");
  }

  const measurement = await addMeasurement(auth.session, consultationId, {
    room_name: body.room_name,
    office_name: body.office_name,
    zone_name: body.zone_name,
    floor: body.floor,
    window_id: body.window_id,
    width: body.width,
    height: body.height,
    sqft: body.sqft,
    quantity: body.quantity,
    glass_type: body.glass_type,
    orientation: body.orientation,
    access_type: body.access_type,
    complexity_level_id: body.complexity_level_id,
    notes: body.notes,
    drawing_data: body.drawing_data,
    sort_order: body.sort_order,
  });

  if (!measurement) {
    return apiError(404, "not_found", "Consultation or survey was not found.");
  }

  return apiSuccess({
    measurement_id: measurement.measurement_id,
  });
}
