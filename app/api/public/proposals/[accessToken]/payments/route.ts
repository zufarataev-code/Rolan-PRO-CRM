import { getPublicPaymentOptions, selectPublicPaymentMethod } from "@/features/payments/public-options";
import { isPaymentMethod } from "@/features/payments/policy";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{ accessToken: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { accessToken } = await context.params;
  const result = await getPublicPaymentOptions(accessToken);

  if (!result) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  return apiSuccess(result);
}

export async function POST(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => null)) as { method?: unknown } | null;

  if (!isPaymentMethod(body?.method)) {
    return apiError(400, "invalid_payment_method", "Unsupported payment method.");
  }

  const { accessToken } = await context.params;
  const result = await selectPublicPaymentMethod(accessToken, body.method);

  if (!result) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (result === "deposit_not_ready") {
    return apiError(409, "deposit_not_ready", "Deposit amount is not ready yet.");
  }

  if (result === "deposit_already_paid") {
    return apiError(409, "deposit_already_paid", "Deposit is already paid.");
  }

  return apiSuccess(result);
}
