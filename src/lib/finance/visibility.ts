const SENSITIVE_FINANCIAL_FIELD_PARTS = [
  "cost",
  "expense",
  "margin",
  "profit",
  "revenue",
  "price",
  "rate",
  "payroll",
  "payout",
  "salary",
  "wage",
  "commission",
  "tax",
] as const;

export function isSensitiveFinancialFieldKey(key: string) {
  const normalizedKey = key.trim().toLowerCase();

  return SENSITIVE_FINANCIAL_FIELD_PARTS.some((part) => normalizedKey.includes(part));
}

export function omitSensitiveFinancialFields<T>(record: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !isSensitiveFinancialFieldKey(key)),
  ) as Record<string, T>;
}
