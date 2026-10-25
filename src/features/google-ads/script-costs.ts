import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Daily campaign costs sent by the owner's Google Ads script (Google Ads →
 * Tools → Scripts) with the CRM key. No developer token, no Google Cloud: the
 * script runs inside the owner's own Google Ads account.
 */
export type ScriptCostRow = {
  date: string;
  campaign_id: string;
  campaign_name: string;
  cost_micros: number;
  clicks: number;
  impressions: number;
};

export type ScriptCostPayload = {
  customer_id: string;
  currency: string;
  rows: ScriptCostRow[];
};

export const MAX_SCRIPT_ROWS = 10_000;

function int(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Checks what the script sent; returns the clean payload or the first problem. */
export function parseScriptCostPayload(body: unknown, today = new Date()): { ok: true; payload: ScriptCostPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON body is required." };
  const raw = body as Record<string, unknown>;
  const customerId = String(raw.customer_id ?? "").replace(/[^0-9]/g, "");
  if (!customerId || customerId.length > 20) return { ok: false, error: "customer_id is required." };
  const currency = String(raw.currency ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "currency must be a 3-letter code." };
  if (!Array.isArray(raw.rows)) return { ok: false, error: "rows must be an array." };
  if (raw.rows.length > MAX_SCRIPT_ROWS) return { ok: false, error: `At most ${MAX_SCRIPT_ROWS} rows per request.` };
  const oldest = new Date(today.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  const newest = new Date(today.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const rows: ScriptCostRow[] = [];
  for (const [index, item] of raw.rows.entries()) {
    const row = (item ?? {}) as Record<string, unknown>;
    const date = String(row.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < oldest || date > newest) return { ok: false, error: `rows[${index}].date must be YYYY-MM-DD within the last 400 days.` };
    const campaignId = String(row.campaign_id ?? "").trim();
    if (!campaignId || campaignId.length > 64) return { ok: false, error: `rows[${index}].campaign_id is required.` };
    const costMicros = row.cost_micros !== undefined ? int(row.cost_micros) : int(Number(row.cost) * 1_000_000);
    const clicks = int(row.clicks ?? 0);
    const impressions = int(row.impressions ?? 0);
    if (costMicros === null || clicks === null || impressions === null) return { ok: false, error: `rows[${index}] has an invalid number.` };
    rows.push({ date, campaign_id: campaignId, campaign_name: String(row.campaign_name ?? campaignId).slice(0, 255), cost_micros: costMicros, clicks, impressions });
  }
  return { ok: true, payload: { customer_id: customerId, currency, rows } };
}

export async function saveScriptCosts(payload: ScriptCostPayload) {
  const now = new Date();
  for (let i = 0; i < payload.rows.length; i += 200) {
    const chunk = payload.rows.slice(i, i + 200);
    await prisma.$transaction(chunk.map((row) => {
      const data = {
        campaign_name: row.campaign_name,
        currency: payload.currency,
        cost_micros: BigInt(row.cost_micros),
        cost_amount: new Prisma.Decimal(row.cost_micros).dividedBy(1_000_000),
        clicks: BigInt(row.clicks),
        impressions: BigInt(row.impressions),
        imported_at: now,
      };
      return prisma.googleAdsDailyCost.upsert({
        where: { customer_id_segments_date_campaign_id: { customer_id: payload.customer_id, segments_date: new Date(`${row.date}T00:00:00.000Z`), campaign_id: row.campaign_id } },
        update: data,
        create: { ...data, customer_id: payload.customer_id, segments_date: new Date(`${row.date}T00:00:00.000Z`), campaign_id: row.campaign_id },
      });
    }));
  }
  const total = payload.rows.reduce((sum, row) => sum + row.cost_micros, 0) / 1_000_000;
  return { imported_rows: payload.rows.length, total_cost: Math.round(total * 100) / 100, currency: payload.currency };
}

/** Spend, clicks and impressions per campaign over the last days, for the CRM screen. */
export async function googleAdsSpendSummary(days = 30, today = new Date()) {
  const span = Math.min(Math.max(Math.round(days) || 30, 1), 366);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - (span - 1) * 86_400_000);
  const rows = await prisma.googleAdsDailyCost.findMany({
    where: { segments_date: { gte: start } },
    select: { campaign_id: true, campaign_name: true, currency: true, cost_amount: true, clicks: true, impressions: true, imported_at: true, segments_date: true },
  });
  const byCampaign = new Map<string, { campaign_id: string; campaign_name: string; currency: string; cost: number; clicks: number; impressions: number }>();
  let lastImportedAt: Date | null = null;
  for (const row of rows) {
    const key = `${row.campaign_id}|${row.currency}`;
    const entry = byCampaign.get(key) ?? { campaign_id: row.campaign_id, campaign_name: row.campaign_name, currency: row.currency, cost: 0, clicks: 0, impressions: 0 };
    entry.cost += Number(row.cost_amount);
    entry.clicks += Number(row.clicks);
    entry.impressions += Number(row.impressions);
    entry.campaign_name = row.campaign_name;
    byCampaign.set(key, entry);
    if (!lastImportedAt || row.imported_at > lastImportedAt) lastImportedAt = row.imported_at;
  }
  const campaigns = [...byCampaign.values()].map((c) => ({ ...c, cost: Math.round(c.cost * 100) / 100 })).sort((a, b) => b.cost - a.cost);
  return {
    days: span,
    start_date: start.toISOString().slice(0, 10),
    total_cost: Math.round(campaigns.reduce((s, c) => s + c.cost, 0) * 100) / 100,
    total_clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    total_impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    currency: campaigns[0]?.currency ?? "USD",
    campaigns,
    last_imported_at: lastImportedAt,
  };
}
