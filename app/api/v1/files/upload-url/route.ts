import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import {
  buildStorageKey,
  getSpacesConfig,
  isAllowedMediaType,
  MAX_UPLOAD_BYTES,
  presignUrl,
} from "@/lib/storage/spaces";

/** Returns a 15-minute presigned PUT so the browser uploads the original file directly. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, auth.reason, "Sign in required.");
  const config = getSpacesConfig();
  if (!config) return apiError(503, "storage_not_configured", "File storage is not configured.");

  const body = (await request.json().catch(() => null)) as
    | { file_name?: string; content_type?: string; size_bytes?: number; scope?: string }
    | null;
  const fileName = body?.file_name?.trim();
  const contentType = body?.content_type?.trim() || "application/octet-stream";
  const size = Number(body?.size_bytes ?? 0);
  if (!fileName) return apiError(400, "invalid_payload", "file_name is required.");
  if (!isAllowedMediaType(contentType)) return apiError(400, "invalid_type", "Only photos, videos and PDF files are allowed.");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return apiError(400, "invalid_size", "File is empty or larger than 5 GB.");
  }

  const key = buildStorageKey({ scope: body?.scope || "general", fileName });
  return apiSuccess({
    key,
    upload_url: presignUrl({ config, method: "PUT", key, expiresSeconds: 15 * 60 }),
    view_url: `/api/v1/files/view?key=${encodeURIComponent(key)}`,
  });
}
