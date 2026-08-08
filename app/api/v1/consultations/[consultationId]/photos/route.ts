import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { addSurveyPhoto, getConsultationByIdForSession } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Photo access denied.");
  }

  const { consultationId } = await context.params;
  const consultation = await getConsultationByIdForSession(auth.session, consultationId);

  if (!consultation?.survey) {
    return apiError(404, "not_found", "Survey was not found.");
  }

  return apiSuccess({
    consultation_files: consultation.consultation_files,
    survey_photos: consultation.survey.photos,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Photo upload denied.");
  }

  const { consultationId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        survey_id?: string | null;
        measurement_id?: string | null;
        file_type?: string;
        original_name?: string;
        file_url?: string;
        mime_type?: string | null;
        size_bytes?: number | null;
        storage_provider?: string;
        storage_bucket?: string | null;
        storage_key?: string;
      }
    | null;

  if (!body?.file_type || !body.original_name?.trim() || !body.file_url?.trim() || !body.storage_key?.trim()) {
    return apiError(
      400,
      "invalid_payload",
      "file_type, original_name, file_url, and storage_key are required.",
    );
  }

  const file = await addSurveyPhoto(auth.session, consultationId, {
    survey_id: body.survey_id,
    measurement_id: body.measurement_id,
    file_type: body.file_type,
    original_name: body.original_name,
    file_url: body.file_url,
    mime_type: body.mime_type,
    size_bytes: body.size_bytes,
    storage_provider: body.storage_provider,
    storage_bucket: body.storage_bucket,
    storage_key: body.storage_key,
  });

  if (!file) {
    return apiError(404, "not_found", "Consultation or survey was not found.");
  }

  return apiSuccess({
    file_id: file.file_id,
  });
}
