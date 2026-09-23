import { listExternalConsultationSlots } from "@/features/integrations/external-api";
import {
  externalApiErrorResponse,
  readExternalApiJson,
} from "@/features/integrations/external-api-core";
import { apiSuccess } from "@/lib/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readExternalApiJson(request);
    return apiSuccess(await listExternalConsultationSlots(body));
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
