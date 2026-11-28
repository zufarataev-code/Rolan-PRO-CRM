import { NextRequest } from "next/server";

import { visitUrl } from "@/features/visits/visit-token";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** The client's visit link for a project, put into the visit notice (Owner, 2026-11-27). */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, auth.reason, "Sign in required.");
  const orderId = request.nextUrl.searchParams.get("order") || "";
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(orderId)) return apiError(400, "invalid_order", "Unknown project.");
  return apiSuccess({ url: visitUrl(orderId) });
}
