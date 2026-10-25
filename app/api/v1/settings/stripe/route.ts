import { NextRequest } from "next/server";

import { clearStripeSecretKey, getStripeKeySummary, saveStripeSecretKey } from "@/features/payments/stripe-settings";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Whether card payments work. Managers see the status; only the owner sets the key. */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Stripe status is for the office.");
  return apiSuccess(await getStripeKeySummary());
}

export async function PUT(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Only the owner sets the Stripe key.");
  const body = (await request.json().catch(() => null)) as { secret_key?: string } | null;
  try {
    return apiSuccess(await saveStripeSecretKey(body?.secret_key, auth.session.user.user_id));
  } catch (error) {
    return apiError(400, "invalid_stripe_key", error instanceof Error ? error.message : "Не удалось сохранить ключ.");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Only the owner removes the Stripe key.");
  return apiSuccess(await clearStripeSecretKey());
}
