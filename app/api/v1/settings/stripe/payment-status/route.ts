import { NextRequest } from "next/server";

import { findPaidStripePaymentLinks } from "@/features/payments/stripe-checkout";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Payment status is for the office.");
  const body = (await request.json().catch(() => null)) as { payment_link_ids?: unknown } | null;
  const ids = Array.isArray(body?.payment_link_ids) ? body.payment_link_ids.map(String) : [];
  try {
    const paid = await findPaidStripePaymentLinks(ids);
    if (paid === "not_configured") return apiError(409, "stripe_not_configured", "Stripe не подключён.");
    return apiSuccess(paid);
  } catch (error) {
    return apiError(502, "stripe_error", error instanceof Error ? error.message : "Stripe не ответил.");
  }
}
