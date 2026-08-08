import { NextRequest } from "next/server";

import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { calculateCuttingPlan } from "@/features/cutting/logic";
import { parseCuttingPreviewPayload } from "@/features/cutting/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Cutting preview denied.");
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = parseCuttingPreviewPayload(body);

  if (!parsed.ok) {
    return apiError(400, parsed.code, parsed.message);
  }

  try {
    const plan = calculateCuttingPlan(parsed.panels, parsed.options);

    return apiSuccess(
      {
        plan,
      },
      {
        readonly: true,
        writes_database: false,
      },
    );
  } catch (error) {
    return apiError(
      400,
      "cutting_preview_failed",
      error instanceof Error ? error.message : "Unable to calculate cutting preview.",
    );
  }
}
