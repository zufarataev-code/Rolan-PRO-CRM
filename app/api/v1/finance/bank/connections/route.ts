import { NextRequest } from "next/server";

import { connectBank } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

export async function POST(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { public_token?: string } | null;
  try {
    return apiSuccess(await connectBank(String(body?.public_token ?? ""), auth.session.user.user_id));
  } catch (error) {
    return bankError(error);
  }
}
