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

  if (result === "payment_processor_not_configured") {
    return apiError(503, "payment_processor_not_configured", "Secure online payment is temporarily unavailable. Please use Zelle or bank transfer.");
  }

  if (result === "invalid_payment_amount") {
    return apiError(409, "invalid_payment_amount", "The online payment amount is invalid. Please contact ROLANPRO.");
  }

  if (result === "payment_processor_error") {
    return apiError(502, "payment_processor_error", "The secure payment processor could not create checkout. Please try again or use Zelle/bank transfer.");
  }

  return apiSuccess(result);
}
