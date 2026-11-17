import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileLegacyGoogleAdsOutcomes } from "@/features/google-ads/legacy-outcomes";
import { sha256Hex } from "@/features/google-ads/normalization";
import { META_GRAPH_VERSION, metaEventTimeError, metaRetryDelayMs, type MetaEventPayload } from "./payload";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function metaCapiConfiguration(env: Record<string, string | undefined> = process.env) {
  const candidate = env.META_CAPI_DATASET_ID?.trim() || "";
  const datasetId = /^\d{1,32}$/.test(candidate) ? candidate : null;
  const token = env.META_CAPI_ACCESS_TOKEN?.trim() || null;
  const testCode = env.META_CAPI_TEST_EVENT_CODE?.trim() || null;
  return { datasetId, token, testCode, configured: Boolean(datasetId && /^\d{1,32}$/.test(datasetId) && token), enabled: env.META_CAPI_UPLOAD_ENABLED === "true" };
}

type DeliveryResult = { status: "accepted" | "retry" | "needs_operator_action"; code: string | null };

/** Graph responses may echo identifiers; return only a fixed code and acceptance. */
export async function deliverMetaEvent(input: { datasetId: string; token: string; testCode: string | null; payload: MetaEventPayload }, fetcher: typeof fetch = fetch): Promise<DeliveryResult> {
  try {
    const response = await fetcher(`https://graph.facebook.com/${META_GRAPH_VERSION}/${input.datasetId}/events`, {
      method: "POST", headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
      body: JSON.stringify({ data: [input.payload], ...(input.testCode ? { test_event_code: input.testCode } : {}) }),
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => null) as { events_received?: unknown; error?: { code?: unknown; is_transient?: unknown } } | null;
    if (response.ok && body?.events_received === 1) return { status: "accepted", code: null };
    const graphCode = typeof body?.error?.code === "number" && Number.isInteger(body.error.code) ? body.error.code : null;
    const code = graphCode === null ? `http_${response.status}` : `graph_${graphCode}`;
    const retryable = response.status === 429 || response.status >= 500 || body?.error?.is_transient === true || [4, 17, 32, 613].includes(graphCode ?? -1);
    return { status: retryable || response.ok ? "retry" : "needs_operator_action", code: response.ok ? "unconfirmed_acceptance" : code };
  } catch {
    // Unknown network outcomes retry the identical event_id; Meta deduplicates it.
    return { status: "retry", code: "network_or_timeout" };
  }
}

export async function processNextMetaCapiEvent() {
  const config = metaCapiConfiguration();
  if (!config.enabled || !config.configured) return { status: "disabled" as const };
  const now = new Date();
  const testCodeHash = config.testCode ? sha256Hex(config.testCode) : null;
  const eligible: Prisma.MetaCapiOutboxWhereInput = {
    next_attempt_at: { lte: now },
    OR: [
      { processing_status: { in: ["queued", "retry"] } },
      { processing_status: "processing", lease_expires_at: { lte: now } },
      { processing_status: "test_accepted", ...(testCodeHash ? { NOT: { test_event_code_hash: testCodeHash } } : {}) },
    ],
  };
  const next = await prisma.metaCapiOutbox.findFirst({ where: eligible, orderBy: [{ next_attempt_at: "asc" }, { created_at: "asc" }] });
  if (!next) return { status: "idle" as const };
  const lease = randomUUID();
  const claimed = await prisma.metaCapiOutbox.updateMany({ where: { AND: [{ meta_capi_outbox_id: next.meta_capi_outbox_id }, eligible] }, data: { processing_status: "processing", lease_token: lease, lease_expires_at: new Date(now.getTime() + LEASE_MS), attempt_count: { increment: 1 }, dataset_id: next.dataset_id ?? config.datasetId } });
  if (!claimed.count) return { status: "busy" as const };
  const key = { meta_capi_outbox_id: next.meta_capi_outbox_id, lease_token: lease };
  async function finish(status: string, code: string | null, extra: Prisma.MetaCapiOutboxUpdateManyMutationInput = {}) {
    await prisma.metaCapiOutbox.updateMany({ where: key, data: { processing_status: status, last_error_code: code, lease_token: null, lease_expires_at: null, ...extra } });
    return { status, code };
  }
  if (next.dataset_id && next.dataset_id !== config.datasetId) return finish("needs_operator_action", "dataset_changed");
  const timeError = metaEventTimeError(next.occurred_at, now);
  if (timeError) return finish("suppressed", timeError);
  const lead = next.lead_id ? await prisma.lead.findUnique({ where: { lead_id: next.lead_id }, select: { consent_snapshots: { where: { effective_at: { lte: now } }, orderBy: [{ effective_at: "desc" }, { created_at: "desc" }], take: 1, select: { ad_user_data: true, ad_personalization: true } } } }) : null;
  if (!lead) return finish("suppressed", "lead_unavailable");
  if (lead.consent_snapshots.some(consent => consent.ad_user_data === "DENIED" || consent.ad_personalization === "DENIED")) return finish("suppressed", "consent_denied");
  if (next.event_name === "ConvertedLead") {
    if (!next.conversion_event_id) return finish("suppressed", "sale_unavailable");
    const sale = await prisma.conversionEvent.findUnique({ where: { conversion_event_id: next.conversion_event_id }, select: { conversion_value: true, adjustments: { select: { adjustment_type: true } } } });
    if (!sale || !(Number(sale.conversion_value) > 0)) return finish("suppressed", "unverified_sale_value");
    if (sale.adjustments.some(item => item.adjustment_type === "RETRACTION")) return finish("suppressed", "sale_retracted");
  }
  const snapshot = next.payload_snapshot as unknown as MetaEventPayload | null;
  const payload = snapshot ? { ...snapshot, user_data: { ...snapshot.user_data } } : null;
  if (!payload || payload.event_id !== next.event_id || payload.event_name !== next.event_name || payload.event_time !== Math.floor(next.occurred_at.getTime() / 1000)) return finish("needs_operator_action", "invalid_snapshot");
  if (lead.consent_snapshots[0]?.ad_user_data !== "GRANTED") {
    delete payload.user_data.em;
    delete payload.user_data.ph;
    if (!payload.user_data.lead_id) return finish("suppressed", "missing_matching_data");
  }
  const outcome = await deliverMetaEvent({ datasetId: config.datasetId!, token: config.token!, testCode: config.testCode, payload });
  if (outcome.status === "accepted") return finish(config.testCode ? "test_accepted" : "accepted", null, config.testCode ? { test_accepted_at: now, test_event_code_hash: testCodeHash } : { accepted_at: now });
  const exhausted = next.attempt_count + 1 >= MAX_ATTEMPTS;
  return finish(exhausted ? "needs_operator_action" : outcome.status, exhausted ? "retry_exhausted" : outcome.code, { next_attempt_at: new Date(now.getTime() + metaRetryDelayMs(next.attempt_count + 1)) });
}

export async function runMetaCapiSyncCycle({ limit = 25 } = {}) {
  const reconciliation = await reconcileLegacyGoogleAdsOutcomes().catch(() => {
    console.error("[meta-capi] legacy_outcomes_unavailable");
    return { recorded: 0, failed: 1 };
  });
  const results: Array<Awaited<ReturnType<typeof processNextMetaCapiEvent>>> = [];
  for (let index = 0; index < Math.max(1, Math.min(25, limit)); index += 1) {
    const result = await processNextMetaCapiEvent();
    results.push(result);
    if (["idle", "disabled", "busy"].includes(result.status)) break;
  }
  return { reconciliation, results };
}

export async function getMetaCapiStatus() {
  const config = metaCapiConfiguration();
  const [counts, oldest, error] = await Promise.all([
    prisma.metaCapiOutbox.groupBy({ by: ["processing_status"], _count: { _all: true } }),
    prisma.metaCapiOutbox.findFirst({ where: { processing_status: { in: ["queued", "retry", "processing"] } }, orderBy: { occurred_at: "asc" }, select: { occurred_at: true } }),
    prisma.metaCapiOutbox.findFirst({ where: { last_error_code: { not: null } }, orderBy: { updated_at: "desc" }, select: { last_error_code: true } }),
  ]);
  return { configured: config.configured, enabled: config.enabled, dataset_id: config.datasetId, mode: !config.enabled || !config.configured ? "disabled" : config.testCode ? "test" : "live", access_token_present: Boolean(config.token), queue: Object.fromEntries(counts.map(item => [item.processing_status, item._count._all])), oldest_pending_at: oldest?.occurred_at ?? null, latest_error_code: error?.last_error_code ?? null };
}

export function startMetaCapiSyncScheduler() {
  const holder = globalThis as unknown as Record<string, unknown>;
  if (holder.__rolanproMetaCapiSync) return;
  holder.__rolanproMetaCapiSync = setInterval(() => { runMetaCapiSyncCycle().catch(() => console.error("[meta-capi] sync_cycle_unavailable")); }, 10 * 60 * 1000);
}
