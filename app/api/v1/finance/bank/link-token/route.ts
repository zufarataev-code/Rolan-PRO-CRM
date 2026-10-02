import { NextRequest } from "next/server";

import { createBankLinkToken } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

export async function POST(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { connection_id?: string } | null;
  try {
    return apiSuccess(await createBankLinkToken(auth.session.user.user_id, body?.connection_id ?? null));
  } catch (error) {
    return bankError(error);
  }
}
