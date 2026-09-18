import { NextRequest } from "next/server";

import {
  ConversionAdjustmentValidationError,
  createConversionAdjustment,
} from "@/features/google-ads/conversion-adjustments";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type AdjustmentRequestBody = {
  conversion_event_id?: unknown;
  financial_reference_id?: unknown;
  adjustment_type?: unknown;
  adjusted_value?: unknown;
  currency?: unknown;
  reason?: unknown;
  occurred_at?: unknown;
};

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads conversion adjustments are owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as AdjustmentRequestBody | null;
  if (!body || typeof body !== "object") {
    return apiError(400, "invalid_body", "A JSON request body is required.");
  }

  if (typeof body.conversion_event_id !== "string") {
    return apiError(400, "conversion_event_required", "conversion_event_id is required.");
  }
  if (typeof body.financial_reference_id !== "string") {
    return apiError(400, "financial_reference_required", "financial_reference_id is required.");
  }
  if (typeof body.adjustment_type !== "string") {
    return apiError(400, "adjustment_type_required", "adjustment_type is required.");
  }

  let adjustedValue: string | number | null | undefined;
  if (
    body.adjusted_value === undefined ||
    body.adjusted_value === null ||
    typeof body.adjusted_value === "string" ||
    typeof body.adjusted_value === "number"
  ) {
    adjustedValue = body.adjusted_value as string | number | null | undefined;
  } else {
    return apiError(400, "invalid_adjusted_value", "adjusted_value must be a decimal string or number.");
  }

  const occurredAt = body.occurred_at === undefined ? new Date() : new Date(String(body.occurred_at));

  try {
    const result = await prisma.$transaction((tx) =>
      createConversionAdjustment(tx, {
        conversionEventId: body.conversion_event_id as string,
        financialReferenceId: body.financial_reference_id as string,
        adjustmentType: body.adjustment_type as string,
        adjustedValue,
        currency: optionalString(body.currency),
        reason: optionalString(body.reason),
        occurredAt,
        createdByUserId: auth.session.user.user_id,
      }),
    );

    return apiSuccess({
      conversion_adjustment_id: result.adjustment.conversion_adjustment_id,
      original_transaction_id: result.adjustment.original_transaction_id,
      adjustment_type: result.adjustment.adjustment_type,
      adjusted_value: result.adjustment.adjusted_value?.toString() ?? null,
      currency: result.adjustment.currency,
      occurred_at: result.adjustment.occurred_at.toISOString(),
      delivery_state: result.deliveryState,
      outbox_id: result.outbox?.conversion_adjustment_outbox_id ?? null,
    });
  } catch (cause) {
    if (cause instanceof ConversionAdjustmentValidationError) {
      return apiError(400, cause.code, cause.message);
    }

    throw cause;
  }
}
