import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { addProjectFile } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project file upload denied.");
  }

  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        file_type?: string;
        original_name?: string;
        file_url?: string;
        mime_type?: string | null;
        size_bytes?: number | null;
        storage_provider?: string;
        storage_bucket?: string | null;
        storage_key?: string;
        position_id?: string | null;
        installer_job_id?: string | null;
      }
    | null;

  if (!body?.file_type || !body.original_name?.trim() || !body.file_url?.trim() || !body.storage_key?.trim()) {
    return apiError(
      400,
      "invalid_payload",
      "file_type, original_name, file_url, and storage_key are required.",
    );
  }

  const file = await addProjectFile(auth.session, projectId, {
    file_type: body.file_type,
    original_name: body.original_name,
    file_url: body.file_url,
    mime_type: body.mime_type,
    size_bytes: body.size_bytes,
    storage_provider: body.storage_provider,
    storage_bucket: body.storage_bucket,
    storage_key: body.storage_key,
    position_id: body.position_id,
    installer_job_id: body.installer_job_id,
  });

  if (!file) {
    return apiError(404, "not_found", "Project was not found.");
  }

  return apiSuccess({
    file_id: file.file_id,
  });
}
