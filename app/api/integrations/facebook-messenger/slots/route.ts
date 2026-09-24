import { listFacebookMessengerSlots } from "@/features/integrations/facebook-messenger";
import {
  facebookMessengerIntegrationErrorResponse,
  readSignedFacebookMessengerJson,
} from "@/features/integrations/facebook-messenger-http";
import { apiSuccess } from "@/lib/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readSignedFacebookMessengerJson(request);
    return apiSuccess(await listFacebookMessengerSlots(body));
  } catch (error) {
    return facebookMessengerIntegrationErrorResponse(error);
  }
}
