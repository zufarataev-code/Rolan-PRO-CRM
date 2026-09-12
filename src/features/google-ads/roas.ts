import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_CONVERTED_LEAD_EVENT } from "./conversion-events";

export class GoogleAdsRoasError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsRoasError";
  }
}

function fail(code: string, message: string): never {
  throw new GoogleAdsRoasError(code, message);
}

function parseIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("invalid_date", `${field} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("invalid_date", `${field} is not a valid calendar date.`);
  }
  return date;
}

export function validateRoasRange(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate, "start_date");
  const end = parseIsoDate(endDate, "end_date");
  if (start.getTime() > end.getTime()) fail("invalid_date_range", "start_date must be on or before end_date.");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 366) fail("date_range_too_large", "ROAS report is limited to 366 days per request.");
  return {
    start,
    end,
    endExclusive: new Date(end.getTime() + 86_400_000),
    days,
  };
}

export type RevenueAdjustment = {
  adjustment_type: string;
  adjusted_value: Prisma.Decimal | null;
};

export function effectiveConversionRevenue(
  originalValue: Prisma.Decimal | null,
  latestAdjustment: RevenueAdjustment | null | undefined,
) {
  if (latestAdjustment?.adjustment_type === "RETRACTION") return new Prisma.Decimal(0);
  if (latestAdjustment?.adjustment_type === "RESTATEMENT") return latestAdjustment.adjusted_value;
  return originalValue;
}

function addDecimal(map: Map<string, Prisma.Decimal>, currency: string, value: Prisma.Decimal) {
  map.set(currency, (map.get(currency) ?? new Prisma.Decimal(0)).plus(value));
}

function hasGoogleClickIdentifier(touchpoint: { gclid: string | null; gbraid: string | null; wbraid: string | null } | null) {
  return Boolean(touchpoint?.gclid || touchpoint?.gbraid || touchpoint?.wbraid);
}

export async function getGoogleAdsRoasReport(startDate: string, endDate: string) {
  const range = validateRoasRange(startDate, endDate);

  const [costRows, conversions] = await Promise.all([
    prisma.googleAdsDailyCost.findMany({
      where: {
        segments_date: { gte: range.start, lte: range.end },
      },
      select: {
        customer_id: true,
        currency: true,
        cost_amount: true,
        clicks: true,
        impressions: true,
      },
    }),
    prisma.conversionEvent.findMany({
      where: {
        event_type: GOOGLE_ADS_CONVERTED_LEAD_EVENT,
        occurred_at: { gte: range.start, lt: range.endExclusive },
      },
      select: {
        conversion_event_id: true,
        conversion_value: true,
        currency: true,
        attribution_touchpoint: {
          select: { gclid: true, gbraid: true, wbraid: true },
        },
        adjustments: {
          orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
          take: 1,
          select: { adjustment_type: true, adjusted_value: true },
        },
      },
    }),
  ]);

  const spendByCurrency = new Map<string, Prisma.Decimal>();
  const revenueByCurrency = new Map<string, Prisma.Decimal>();
  const unknownRevenueByCurrency = new Map<string, number>();
  let clicks = 0n;
  let impressions = 0n;
  const customerIds = new Set<string>();

  for (const row of costRows) {
    addDecimal(spendByCurrency, row.currency, row.cost_amount);
    clicks += row.clicks;
    impressions += row.impressions;
    customerIds.add(row.customer_id);
  }

  let attributedConversions = 0;
  for (const conversion of conversions) {
    if (!hasGoogleClickIdentifier(conversion.attribution_touchpoint)) continue;
    attributedConversions += 1;
    const currency = conversion.currency.toUpperCase();
    const revenue = effectiveConversionRevenue(conversion.conversion_value, conversion.adjustments[0]);
    if (revenue === null) {
      unknownRevenueByCurrency.set(currency, (unknownRevenueByCurrency.get(currency) ?? 0) + 1);
      continue;
    }
    addDecimal(revenueByCurrency, currency, revenue);
  }

  const currencies = [...new Set([...spendByCurrency.keys(), ...revenueByCurrency.keys(), ...unknownRevenueByCurrency.keys()])].sort();
  const byCurrency = currencies.map((currency) => {
    const spend = spendByCurrency.get(currency) ?? new Prisma.Decimal(0);
    const revenue = revenueByCurrency.get(currency) ?? new Prisma.Decimal(0);
    return {
      currency,
      ad_spend: spend.toFixed(6),
      attributed_revenue: revenue.toFixed(2),
      roas: spend.gt(0) ? revenue.div(spend).toDecimalPlaces(4).toString() : null,
      unknown_revenue_conversions: unknownRevenueByCurrency.get(currency) ?? 0,
    };
  });

  return {
    startDate,
    endDate,
    customerIds: [...customerIds].sort(),
    attributedConversions,
    clicks: clicks.toString(),
    impressions: impressions.toString(),
    byCurrency,
  };
}
