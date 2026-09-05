export const PAYMENT_METHODS = {
  ZELLE: "zelle",
  BANK_TRANSFER: "bank_transfer",
  PAYMENT_SYSTEM: "payment_system",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_SYSTEM_FEE_PERCENT = 3.5;

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
