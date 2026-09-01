import { NextRequest } from "next/server";

import { requestZadarmaCallback } from "@/features/zadarma/service";
import { LEGACY_WORKSPACE_ROLES } from "@/features/legacy-crm/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "CRM access is required.");
  const body = await request.json().catch(() => null) as { to?: unknown; extension?: unknown } | null;
  if (!body) return apiError(400, "invalid_payload", "Phone and extension are required.");
  try {
    return apiSuccess(await requestZadarmaCallback({ to: String(body.to ?? ""), extension: String(body.extension ?? "") }));
  } catch (cause) {
    return apiError(400, "zadarma_callback_failed", cause instanceof Error ? cause.message : "Could not start the call.");
  }
}
