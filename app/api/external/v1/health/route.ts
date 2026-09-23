import { authorizeExternalApiRequest, externalApiErrorResponse } from "@/features/integrations/external-api-core";
import { apiSuccess } from "@/lib/http/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    authorizeExternalApiRequest(request);
    return apiSuccess({
      status: "ok",
      api: "rolanpro-external",
      version: "v1",
    });
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}
