import { NextRequest, NextResponse } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";
import { getSpacesConfig, isValidStorageKey, presignUrl } from "@/lib/storage/spaces";

/** Staff-only view/download: redirects to a one-hour presigned GET of the original. */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, auth.reason, "Sign in required.");
  const config = getSpacesConfig();
  if (!config) return apiError(503, "storage_not_configured", "File storage is not configured.");
  const key = request.nextUrl.searchParams.get("key") || "";
  if (!isValidStorageKey(key)) return apiError(400, "invalid_key", "Invalid file key.");
  const download = request.nextUrl.searchParams.get("download");
  const extraQuery = download
    ? { "response-content-disposition": `attachment; filename="${download.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)}"` }
    : undefined;
  const url = presignUrl({ config, method: "GET", key, expiresSeconds: 3600, extraQuery });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=3000" } });
}
