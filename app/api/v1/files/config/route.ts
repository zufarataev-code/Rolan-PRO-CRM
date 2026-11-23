import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getSpacesConfig, MAX_UPLOAD_BYTES } from "@/lib/storage/spaces";
import { LOCAL_MAX_UPLOAD_BYTES } from "@/lib/storage/local";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, auth.reason, "Sign in required.");
  const spaces = Boolean(getSpacesConfig());
  return apiSuccess({ enabled: true, storage: spaces ? "spaces" : "server", max_bytes: spaces ? MAX_UPLOAD_BYTES : LOCAL_MAX_UPLOAD_BYTES });
}
