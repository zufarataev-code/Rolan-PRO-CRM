import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/http/api-response";
import { loadFieldMeasureWorkspace } from "@/features/field-measure/server";
import { fieldMeasureDetail } from "@/features/field-measure/view";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const loaded = await loadFieldMeasureWorkspace(request);
  if (!loaded.ok) return loaded.response;
  const { orderId } = await context.params;
  const project = fieldMeasureDetail(loaded.payload, orderId, loaded.viewer);
  if (!project) return apiError(404, "not_found", "Проект не найден или не назначен вам.");
  return apiSuccess({ project });
}
