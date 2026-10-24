export const PAYMENT_METHODS = {
  ZELLE: "zelle",
  BANK_TRANSFER: "bank_transfer",
  PAYMENT_SYSTEM: "payment_system",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

// Card processing fee passed to the client (Owner, 2026-10-24: «доплата за карту…
// процент Stripe перекинуть на клиента»). 3% = Visa's surcharge cap and roughly
// Stripe's own rate; Zelle and bank transfer stay free.
export const PAYMENT_SYSTEM_FEE_PERCENT = 3;
/** Checkouts created before 2026-10-24 carried 3.5%; they still verify. */
export const LEGACY_PAYMENT_SYSTEM_FEE_PERCENTS = [3.5];

/** Company rule (Owner, 2026-10-24): 10% of the project, never more than $1 000 — residential and commercial alike. */
export const DEPOSIT_PERCENT = 10;
export const DEPOSIT_CAP_USD = 1_000;

// propertyType is kept in the signature for callers; the rule no longer depends on it.
export function calculateSuggestedDeposit(total: number, _propertyType?: string | null) {
  const normalizedTotal = Math.max(0, Number.isFinite(total) ? total : 0);
  return Math.round(Math.min(normalizedTotal * (DEPOSIT_PERCENT / 100), DEPOSIT_CAP_USD) * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePaymentAmount(baseAmount: number, method: PaymentMethod) {
  const normalizedBase = roundMoney(Math.max(0, Number.isFinite(baseAmount) ? baseAmount : 0));
  const feePercent = method === PAYMENT_METHODS.PAYMENT_SYSTEM ? PAYMENT_SYSTEM_FEE_PERCENT : 0;
  const processingFee = roundMoney(normalizedBase * (feePercent / 100));

  return {
    method,
    base_amount: normalizedBase,
    fee_percent: feePercent,
    processing_fee: processingFee,
    payable_amount: roundMoney(normalizedBase + processingFee),
  };
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return Object.values(PAYMENT_METHODS).includes(value as PaymentMethod);
}
