import { NextRequest } from "next/server";

import { updateBankTransaction } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

type RouteContext = { params: Promise<{ transactionId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  const { transactionId } = await context.params;
  const body = (await request.json().catch(() => null)) as { category_code?: string; remember?: boolean; note?: string | null } | null;
  try {
    return apiSuccess(await updateBankTransaction(transactionId, body ?? {}, auth.session.user.user_id));
  } catch (error) {
    return bankError(error);
  }
}
