/**
 * Расчёт аванса и налога с продаж.
 *
 * Аванс на жилых объектах в Калифорнии ограничен законом:
 * по правилам CSLB для home improvement contract предоплата не может
 * превышать 1 000 долларов или 10% суммы договора — что меньше
 * (Business & Professions Code §7159.5). Коммерческие договоры под это
 * определение не подпадают.
 *
 * Ограничение применяется автоматически, чтобы система не предлагала
 * менеджеру сумму, которую нельзя брать. Это не юридическая консультация:
 * решение по политике авансов принимает владелец после проверки с юристом.
 */

export const RESIDENTIAL_DEPOSIT_CAP_USD = 1000;
export const RESIDENTIAL_DEPOSIT_CAP_PERCENT = 10;

export type PropertyType = "residential" | "commercial";

export type DepositCalculation = {
  /** Сумма к оплате авансом. */
  amount: number;
  /** Предел по закону штата; null для коммерции. */
  legalCap: number | null;
  /** true — запрошенный процент был уменьшен до предела. */
  capped: boolean;
  /** Фактический процент от суммы договора после ограничения. */
  effectivePercent: number;
};

/**
 * Считает аванс с учётом предела для жилых объектов.
 *
 * @param contractTotal сумма договора, включая налог
 * @param requestedPercent желаемый процент аванса
 * @param propertyType сегмент объекта
 */
export function calculateDeposit(
  contractTotal: number,
  requestedPercent: number,
  propertyType: PropertyType,
): DepositCalculation {
  const total = Math.max(0, round2(contractTotal));
  const requested = round2((total * clampPercent(requestedPercent)) / 100);

  if (propertyType === "commercial") {
    return {
      amount: requested,
      legalCap: null,
      capped: false,
      effectivePercent: percentOf(requested, total),
    };
  }

  const legalCap = round2(
    Math.min(
      RESIDENTIAL_DEPOSIT_CAP_USD,
      (total * RESIDENTIAL_DEPOSIT_CAP_PERCENT) / 100,
    ),
  );

  const amount = Math.min(requested, legalCap);

  return {
    amount,
    legalCap,
    capped: amount < requested,
    effectivePercent: percentOf(amount, total),
  };
}

/**
 * Считает налог с продаж и итог по КП.
 *
 * Ставка хранится в самом КП: она зависит от адреса объекта и не должна
 * меняться задним числом в уже отправленном клиенту документе.
 */
export function calculateTax(subtotal: number, taxRatePercent: number) {
  const base = Math.max(0, round2(subtotal));
  const rate = clampPercent(taxRatePercent);
  const taxAmount = round2((base * rate) / 100);

  return {
    subtotal: base,
    taxRatePercent: rate,
    taxAmount,
    totalWithTax: round2(base + taxAmount),
  };
}

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.min(value, 100);
}

function percentOf(part: number, whole: number) {
  if (whole <= 0) {
    return 0;
  }

  return round2((part / whole) * 100);
}
