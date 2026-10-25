import { NextRequest } from "next/server";

import { createStripeProjectPaymentLink } from "@/features/payments/stripe-checkout";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Payment links are made by the office.");
  const body = (await request.json().catch(() => null)) as { order_id?: string; order_number?: string; amount?: number; description?: string; currency?: string } | null;
  try {
    const created = await createStripeProjectPaymentLink({
      orderId: String(body?.order_id ?? ""),
      orderNumber: String(body?.order_number ?? ""),
      amount: Number(body?.amount),
      description: String(body?.description ?? ""),
      currency: body?.currency,
    });
    if (created === "not_configured") return apiError(409, "stripe_not_configured", "Stripe не подключён: владелец вставляет ключ в Настройки → Stripe.");
    if (created === "invalid_amount") return apiError(400, "invalid_amount", "Сумма должна быть больше нуля.");
    return apiSuccess(created);
  } catch (error) {
    return apiError(502, "stripe_error", error instanceof Error ? error.message : "Stripe не ответил.");
  }
}
