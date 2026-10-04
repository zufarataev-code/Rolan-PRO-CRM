import { NextRequest } from "next/server";

import { getPlaidSettingsSummary, savePlaidSettings } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  return apiSuccess(await getPlaidSettingsSummary());
}

export async function PUT(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { client_id?: string; secret?: string; environment?: string } | null;
  try {
    return apiSuccess(await savePlaidSettings({ clientId: body?.client_id, secret: body?.secret, environment: body?.environment }, auth.session.user.user_id));
  } catch (error) {
    return bankError(error);
  }
}
