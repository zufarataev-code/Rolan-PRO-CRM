import { Prisma } from "@prisma/client";

import {
  GOOGLE_ADS_CONVERTED_LEAD_EVENT,
  GOOGLE_ADS_DEFAULT_SETTING_KEY,
} from "./conversion-events";

export const GOOGLE_ADS_ADJUSTMENT_RETRACTION = "RETRACTION" as const;
export const GOOGLE_ADS_ADJUSTMENT_RESTATEMENT = "RESTATEMENT" as const;

export type GoogleAdsAdjustmentType =
  | typeof GOOGLE_ADS_ADJUSTMENT_RETRACTION
  | typeof GOOGLE_ADS_ADJUSTMENT_RESTATEMENT;

export class ConversionAdjustmentValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConversionAdjustmentValidationError";
  }
}

type AdjustmentDraftInput = {
  financialReferenceId: string;
  adjustmentType: string;
  adjustedValue?: string | number | Prisma.Decimal | null;
  currency?: string | null;
  reason?: string | null;
};

export type CreateConversionAdjustmentInput = AdjustmentDraftInput & {
  conversionEventId: string;
  occurredAt: Date;
  createdByUserId?: string | null;
};

export type NormalizedAdjustmentDraft = {
  financialReferenceId: string;
  adjustmentType: GoogleAdsAdjustmentType;
  adjustedValue: Prisma.Decimal | null;
  currency: string | null;
  reason: string | null;
};

function validationError(code: string, message: string): never {
  throw new ConversionAdjustmentValidationError(code, message);
}

export function normalizeAdjustmentCurrency(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    validationError("invalid_currency", "Currency must be a 3-letter ISO-style code.");
  }
  return normalized;
}

function parseAdjustmentDecimal(value: string | number | Prisma.Decimal) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    validationError("invalid_adjusted_value", "Adjusted value must be a finite decimal value.");
  }

  try {
    const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value).trim());
    if (decimal.isNegative()) {
      validationError("invalid_adjusted_value", "Adjusted value cannot be negative.");
    }
    return decimal;
  } catch (cause) {
    if (cause instanceof ConversionAdjustmentValidationError) throw cause;
    validationError("invalid_adjusted_value", "Adjusted value must be a valid decimal value.");
  }
}

export function normalizeConversionAdjustmentDraft(input: AdjustmentDraftInput): NormalizedAdjustmentDraft {
  const financialReferenceId = input.financialReferenceId?.trim() ?? "";
  if (!financialReferenceId) {
    validationError("financial_reference_required", "financial_reference_id is required.");
  }
  if (financialReferenceId.length > 191) {
    validationError("financial_reference_too_long", "financial_reference_id must be 191 characters or fewer.");
  }

  const adjustmentType = input.adjustmentType?.trim().toUpperCase();
  if (
    adjustmentType !== GOOGLE_ADS_ADJUSTMENT_RETRACTION &&
    adjustmentType !== GOOGLE_ADS_ADJUSTMENT_RESTATEMENT
  ) {
    validationError("invalid_adjustment_type", "adjustment_type must be RETRACTION or RESTATEMENT.");
  }

  let adjustedValue: Prisma.Decimal | null = null;
  if (adjustmentType === GOOGLE_ADS_ADJUSTMENT_RETRACTION) {
    if (input.adjustedValue !== undefined && input.adjustedValue !== null) {
      validationError("retraction_value_forbidden", "RETRACTION must not include adjusted_value.");
    }
  } else {
    if (input.adjustedValue === undefined || input.adjustedValue === null || String(input.adjustedValue).trim() === "") {
      validationError("restatement_value_required", "RESTATEMENT requires adjusted_value.");
    }
    adjustedValue = parseAdjustmentDecimal(input.adjustedValue);
  }

  const currency = normalizeAdjustmentCurrency(input.currency);
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > 255) {
    validationError("reason_too_long", "reason must be 255 characters or fewer.");
  }

  return {
    financialReferenceId,
    adjustmentType,
    adjustedValue,
    currency,
    reason,
  };
}

function sameDecimal(left: Prisma.Decimal | null, right: Prisma.Decimal | null) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

/**
 * Records an auditable business correction and its durable Google Ads outbox row.
 * Google is never called here; finance/refund state and delivery remain decoupled.
 */
export async function createConversionAdjustment(
  tx: Prisma.TransactionClient,
  input: CreateConversionAdjustmentInput,
) {
  if (!input.conversionEventId?.trim()) {
    validationError("conversion_event_required", "conversion_event_id is required.");
  }
  if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) {
    validationError("invalid_occurred_at", "occurred_at must be a valid date.");
  }

  const normalized = normalizeConversionAdjustmentDraft(input);
  const event = await tx.conversionEvent.findUnique({
    where: { conversion_event_id: input.conversionEventId.trim() },
    select: {
      conversion_event_id: true,
      event_type: true,
      transaction_id: true,
      currency: true,
    },
  });

  if (!event || event.event_type !== GOOGLE_ADS_CONVERTED_LEAD_EVENT) {
    validationError(
      "converted_lead_event_not_found",
      "The referenced converted-lead conversion event does not exist.",
    );
  }

  const currency =
    normalized.adjustmentType === GOOGLE_ADS_ADJUSTMENT_RESTATEMENT
      ? normalized.currency ?? event.currency.toUpperCase()
      : null;

  const existing = await tx.conversionAdjustment.findUnique({
    where: {
      conversion_event_id_financial_reference_id_adjustment_type: {
        conversion_event_id: event.conversion_event_id,
        financial_reference_id: normalized.financialReferenceId,
        adjustment_type: normalized.adjustmentType,
      },
    },
  });

  if (
    existing &&
    (!sameDecimal(existing.adjusted_value, normalized.adjustedValue) ||
      (existing.currency ?? null) !== currency ||
      existing.original_transaction_id !== event.transaction_id)
  ) {
    validationError(
      "adjustment_idempotency_conflict",
      "An adjustment already exists for this financial reference with different immutable values.",
    );
  }

  const adjustment =
    existing ??
    (await tx.conversionAdjustment.create({
      data: {
        conversion_event_id: event.conversion_event_id,
        adjustment_type: normalized.adjustmentType,
        financial_reference_id: normalized.financialReferenceId,
        original_transaction_id: event.transaction_id,
        adjusted_value: normalized.adjustedValue,
        currency,
        reason: normalized.reason,
        occurred_at: input.occurredAt,
        created_by_user_id: input.createdByUserId ?? null,
      },
    }));

  const settings = await tx.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      converted_lead_action_id: true,
    },
  });

  if (!settings?.conversion_owner_customer_id || !settings.converted_lead_action_id) {
    return {
      adjustment,
      outbox: null,
      deliveryState: "awaiting_configuration" as const,
    };
  }

  const outbox = await tx.conversionAdjustmentOutbox.upsert({
    where: {
      destination_account_id_action_id_original_transaction_id_conversion_adjustment_id: {
        destination_account_id: settings.conversion_owner_customer_id,
        action_id: settings.converted_lead_action_id,
        original_transaction_id: event.transaction_id,
        conversion_adjustment_id: adjustment.conversion_adjustment_id,
      },
    },
    update: {},
    create: {
      conversion_adjustment_id: adjustment.conversion_adjustment_id,
      destination_account_id: settings.conversion_owner_customer_id,
      action_id: settings.converted_lead_action_id,
      original_transaction_id: event.transaction_id,
      processing_status: "queued",
    },
  });

  return {
    adjustment,
    outbox,
    deliveryState: "queued" as const,
  };
}
