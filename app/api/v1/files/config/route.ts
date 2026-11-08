import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getSpacesConfig, MAX_UPLOAD_BYTES } from "@/lib/storage/spaces";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, auth.reason, "Sign in required.");
  return apiSuccess({ enabled: Boolean(getSpacesConfig()), max_bytes: MAX_UPLOAD_BYTES });
}
