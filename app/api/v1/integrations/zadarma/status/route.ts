import { NextRequest } from "next/server";

import { getZadarmaConfig, getZadarmaExtensions } from "@/features/zadarma/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  const config = getZadarmaConfig();
  let extensions: string[] = [];
  let error = "";
  if (config.ready) {
    try { extensions = await getZadarmaExtensions(); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Could not connect to Zadarma."; }
  }
  return apiSuccess({ connected: config.ready && !error, webhookUrl: config.webhookUrl, extensions, error });
}
