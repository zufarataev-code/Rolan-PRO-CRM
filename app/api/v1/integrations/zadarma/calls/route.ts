import { NextRequest } from "next/server";

import { listZadarmaCalls } from "@/features/zadarma/service";
import { LEGACY_WORKSPACE_ROLES } from "@/features/legacy-crm/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "CRM access is required.");
  const rawSince = request.nextUrl.searchParams.get("since");
  const parsedSince = rawSince ? new Date(rawSince) : undefined;
  const since = parsedSince && !Number.isNaN(parsedSince.getTime()) ? parsedSince : undefined;
  return apiSuccess(await listZadarmaCalls(since));
}
