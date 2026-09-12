import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { getGoogleAccessToken } from "./oauth";

const GOOGLE_ADS_API_VERSION = "v25";
const MAX_IMPORT_DAYS = 31;

type GoogleAdsRow = {
  campaign?: { id?: string; name?: string };
  customer?: { currencyCode?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string; clicks?: string; impressions?: string };
};

type GoogleAdsStreamResponse = {
  results?: GoogleAdsRow[];
};

export class GoogleAdsCostFeedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsCostFeedError";
  }
}

function fail(code: string, message: string): never {
  throw new GoogleAdsCostFeedError(code, message);
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeGoogleId(value: string) {
  return value.replace(/[\s-]/g, "");
}

function parseIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("invalid_date", `${field} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("invalid_date", `${field} is not a valid calendar date.`);
  }
  return date;
}

export function validateCostImportRange(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate, "start_date");
  const end = parseIsoDate(endDate, "end_date");
  if (start.getTime() > end.getTime()) fail("invalid_date_range", "start_date must be on or before end_date.");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > MAX_IMPORT_DAYS) {
    fail("date_range_too_large", `A single cost import is limited to ${MAX_IMPORT_DAYS} days.`);
  }
  return { start, end, days };
}

export function buildGoogleAdsCostQuery(startDate: string, endDate: string) {
  validateCostImportRange(startDate, endDate);
  return [
    "SELECT",
    "  segments.date,",
    "  campaign.id,",
    "  campaign.name,",
    "  customer.currency_code,",
    "  metrics.cost_micros,",
    "  metrics.clicks,",
    "  metrics.impressions",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "  AND campaign.status != 'REMOVED'",
  ].join("\n");
}

function parseInt64(value: string | undefined, field: string) {
  const normalized = value?.trim() || "0";
  if (!/^\d+$/.test(normalized)) fail("invalid_google_response", `${field} is not a valid non-negative INT64.`);
  try {
    return BigInt(normalized);
  } catch {
    return fail("invalid_google_response", `${field} exceeds supported INT64 parsing.`);
  }
}

export function costMicrosToDecimal(costMicros: bigint) {
  return new Prisma.Decimal(costMicros.toString()).div(1_000_000);
}

export function flattenGoogleAdsCostStream(body: unknown) {
  if (!Array.isArray(body)) fail("invalid_google_response", "Google Ads SearchStream response must be an array.");
  return body.flatMap((chunk) => {
    if (!chunk || typeof chunk !== "object") return [];
    const results = (chunk as GoogleAdsStreamResponse).results;
    return Array.isArray(results) ? results : [];
  });
}

export async function importGoogleAdsDailyCosts(startDate: string, endDate: string) {
  validateCostImportRange(startDate, endDate);
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      login_customer_id: true,
    },
  });

  const configuredCustomerId = trimOrNull(settings?.conversion_owner_customer_id);
  if (!configuredCustomerId) {
    fail("google_ads_customer_not_configured", "Google Ads customer ID is not configured.");
  }
  const customerId = normalizeGoogleId(configuredCustomerId);
  if (!/^\d+$/.test(customerId)) fail("invalid_google_ads_customer_id", "Google Ads customer ID must be numeric.");

  const accessToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/adwords"]);
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
  // Developer tokens were sunset on 2026-09-09. Keep the legacy header only
  // when an older deployment already has one; Cloud project access is authoritative.
  const legacyDeveloperToken = trimOrNull(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  if (legacyDeveloperToken) headers["developer-token"] = legacyDeveloperToken;
  const loginCustomerId = trimOrNull(settings?.login_customer_id ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  if (loginCustomerId) headers["login-customer-id"] = normalizeGoogleId(loginCustomerId);

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: buildGoogleAdsCostQuery(startDate, endDate) }),
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const error = record?.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
    const message =
      typeof error?.message === "string" ? error.message.slice(0, 1000) : "Google Ads cost query failed.";
    fail(`google_ads_http_${response.status}`, message);
  }

  const rows = flattenGoogleAdsCostStream(body);
  let imported = 0;
  let totalCostMicros = 0n;
  let totalClicks = 0n;
  let totalImpressions = 0n;
  const currencies = new Set<string>();

  for (const row of rows) {
    const date = row.segments?.date;
    const campaignId = row.campaign?.id?.trim();
    const campaignName = row.campaign?.name?.trim();
    const currency = row.customer?.currencyCode?.trim().toUpperCase();
    if (!date || !campaignId || !campaignName || !currency || !/^[A-Z]{3}$/.test(currency)) {
      fail("invalid_google_response", "Google Ads cost row is missing date, campaign, or currency fields.");
    }
    const segmentsDate = parseIsoDate(date, "segments.date");
    const costMicros = parseInt64(row.metrics?.costMicros, "metrics.cost_micros");
    const clicks = parseInt64(row.metrics?.clicks, "metrics.clicks");
    const impressions = parseInt64(row.metrics?.impressions, "metrics.impressions");
    const costAmount = costMicrosToDecimal(costMicros);

    await prisma.googleAdsDailyCost.upsert({
      where: {
        customer_id_segments_date_campaign_id: {
          customer_id: customerId,
          segments_date: segmentsDate,
          campaign_id: campaignId,
        },
      },
      update: {
        campaign_name: campaignName,
        currency,
        cost_micros: costMicros,
        cost_amount: costAmount,
        clicks,
        impressions,
        imported_at: new Date(),
      },
      create: {
        customer_id: customerId,
        segments_date: segmentsDate,
        campaign_id: campaignId,
        campaign_name: campaignName,
        currency,
        cost_micros: costMicros,
        cost_amount: costAmount,
        clicks,
        impressions,
        imported_at: new Date(),
      },
    });

    imported += 1;
    totalCostMicros += costMicros;
    totalClicks += clicks;
    totalImpressions += impressions;
    currencies.add(currency);
  }

  return {
    customerId,
    startDate,
    endDate,
    importedRows: imported,
    totalCostMicros: totalCostMicros.toString(),
    totalCostAmount: costMicrosToDecimal(totalCostMicros).toFixed(6),
    totalClicks: totalClicks.toString(),
    totalImpressions: totalImpressions.toString(),
    currencies: [...currencies].sort(),
  };
}
