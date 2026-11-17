import { getMetaCapiStatus } from "@/features/meta-capi/processor";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Meta CAPI status is owner-only.");
  return apiSuccess(await getMetaCapiStatus());
}
