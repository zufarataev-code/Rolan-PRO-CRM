import { NextRequest } from "next/server";

import { apiSuccess } from "@/lib/http/api-response";
import { loadFieldMeasureWorkspace } from "@/features/field-measure/server";
import { fieldMeasureProjects } from "@/features/field-measure/view";

export async function GET(request: NextRequest) {
  const loaded = await loadFieldMeasureWorkspace(request);
  if (!loaded.ok) return loaded.response;
  return apiSuccess({ projects: fieldMeasureProjects(loaded.payload, loaded.viewer) });
}
