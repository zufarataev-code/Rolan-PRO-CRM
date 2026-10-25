import { integrationKeyFromHeaders, verifyIntegrationKey } from "@/features/integrations/api-keys";
import { parseScriptCostPayload, saveScriptCosts } from "@/features/google-ads/script-costs";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** The owner's Google Ads script posts daily campaign costs here with the CRM key. */
export async function POST(request: Request) {
  const key = integrationKeyFromHeaders(request.headers);
  if (!key || !(await verifyIntegrationKey("google_ads", key))) {
    return apiError(401, "invalid_integration_key", "The CRM key is missing, wrong or switched off. Create a new one in CRM → Settings → Integrations → Google Ads.");
  }
  const parsed = parseScriptCostPayload(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, "invalid_payload", parsed.error);
  return apiSuccess(await saveScriptCosts(parsed.payload));
}
