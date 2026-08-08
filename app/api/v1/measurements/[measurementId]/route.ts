import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { updateMeasurement } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    measurementId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Measurement update denied.");
  }

  const { measurementId } = await context.params;
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

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const updated = await updateMeasurement(auth.session, measurementId, body);

  if (!updated) {
    return apiError(404, "not_found", "Measurement was not found.");
  }

  return apiSuccess({
    measurement_id: updated.measurement_id,
  });
}
