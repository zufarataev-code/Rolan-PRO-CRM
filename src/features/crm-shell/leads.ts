/**
 * The leads screen of the new interface reads the same lead records as the
 * working CRM (GET /api/v1/leads) and changes a stage through the same
 * endpoint (PATCH /api/v1/leads/<id>). This file only arranges them for the
 * screen, the way the working screen does (canonicalMessengerLeadRows).
 */

import { LEAD_CONTACT_TAGS, type LeadContactTagCode } from "@/features/sales/lead-stages";

export type LeadStage = { code: string; name: string; closed: boolean; manual: boolean };
export { LEAD_CONTACT_TAGS };
export type { LeadContactTagCode };

export type ApiLead = {
  lead_id: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  contact_title?: string | null;
  claimed_at?: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  contact_tag?: LeadContactTagCode | null;
  city?: { name_ru: string } | null;
  assigned_manager?: { full_name: string } | null;
  pipeline_status: { status_code: string; name_ru: string; is_closed: boolean } | null;
  outcome_stage?: string | null;
  delivery?: Partial<Record<"facebook" | "google", { event_name: string; processing_status: string; status_label: string; updated_at: string }[]>>;
  stage_history?: { occurred_at: string; pipeline_status_code?: string; reason?: string }[];
  created_at: string;
  status_flags?: { is_new?: boolean };
};

export type LeadRow = {
  id: string;
  name: string;
  person: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  sourceLabel: string;
  city: string;
  manager: string;
  message: string;
  receivedAt: string;
  isNew: boolean;
  /** Call outcome marked by a manager, or null until someone called. */
  contactTag: LeadContactTagCode | null;
  /** The stored status: what a stage change must still find on the server. */
  statusCode: string;
  /** The stage shown: a recorded sale or loss outranks the stored status. */
  stageCode: string;
  stageName: string;
  stageClosed: boolean;
  /** A stage set by a recorded outcome cannot be changed by hand. */
  stageLocked: boolean;
  /** Someone is creating a project from this lead right now. */
  beingConverted: boolean;
  delivery: ApiLead["delivery"];
  history: { at: string; stage: string; reason: string }[];
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: "Сайт",
  facebook: "Facebook",
  facebook_messenger: "Messenger",
  meta_lead_ads: "Meta · Lead Ads",
  callrail: "Звонок · CallRail",
  "ai-chat": "ИИ-чат",
};

/** Statuses from which «Создать проект» is offered (CANONICAL_OPEN_LEAD_STATUSES in the working CRM). */
export const OPEN_LEAD_STATUSES = ["NEW_LEAD", "LEAD", "CONTACTING", "CONTACTED", "QUALIFIED", "CONSULTATION_SCHEDULED"];
export const REASON_STAGES = ["DISQUALIFIED", "CLOSED_LOST", "SPAM"];
const CLAIM_SHOWN_MS = 10 * 60 * 1000;

export function leadRows(leads: ApiLead[], stages: LeadStage[], now = Date.now()): LeadRow[] {
  const stageName = (code: string) => stages.find((stage) => stage.code === code)?.name ?? "";
  return leads
    .filter((lead) => lead?.lead_id && lead.pipeline_status)
    .map((lead) => {
      const status = lead.pipeline_status!;
      const stageCode = lead.outcome_stage || status.status_code;
      const claimedAt = lead.claimed_at ? new Date(lead.claimed_at).getTime() : NaN;
      return {
        id: lead.lead_id,
        name: lead.name || "Без имени",
        person: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
        company: [lead.company_name, lead.contact_title].filter(Boolean).join(" · "),
        phone: lead.phone || "",
        email: lead.email || "",
        source: lead.source || "",
        sourceLabel: LEAD_SOURCE_LABELS[lead.source || ""] ?? (lead.source || "Заявка"),
        city: lead.city?.name_ru || "",
        manager: lead.assigned_manager?.full_name || "",
        message: lead.notes || "",
        receivedAt: lead.created_at,
        isNew: Boolean(lead.status_flags?.is_new),
        contactTag: LEAD_CONTACT_TAGS.some((tag) => tag.code === lead.contact_tag) ? (lead.contact_tag as LeadContactTagCode) : null,
        statusCode: status.status_code,
        stageCode,
        stageName: stageName(stageCode) || status.name_ru || stageCode,
        stageClosed: Boolean(lead.outcome_stage || status.is_closed),
        stageLocked: Boolean(lead.outcome_stage),
        beingConverted: Number.isFinite(claimedAt) && now - claimedAt < CLAIM_SHOWN_MS,
        delivery: lead.delivery,
        history: (lead.stage_history ?? []).map((change) => ({ at: change.occurred_at, stage: stageName(change.pipeline_status_code ?? "") || change.pipeline_status_code || "", reason: change.reason || "" })),
      };
    });
}

const TAG_FILTER_PREFIX = "tag:";

/** "active" — everything not closed; "closed" — everything closed; "tag:<code>" — one call outcome ("tag:none" — not called yet); otherwise one stage. */
export function filterLeads(rows: LeadRow[], filter: string, query: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    const inStage = filter === "active"
      ? !row.stageClosed
      : filter === "closed"
        ? row.stageClosed
        : filter.startsWith(TAG_FILTER_PREFIX)
          ? (filter === `${TAG_FILTER_PREFIX}none` ? !row.contactTag && !row.stageClosed : row.contactTag === filter.slice(TAG_FILTER_PREFIX.length))
          : row.stageCode === filter;
    if (!inStage) return false;
    return !needle || `${row.name} ${row.person} ${row.company} ${row.phone} ${row.email} ${row.message}`.toLowerCase().includes(needle);
  });
}

/** Filter chips: «Активные», every open stage that has leads, «Закрытые». */
export function leadFilters(rows: LeadRow[], stages: LeadStage[]) {
  const open = stages
    .filter((stage) => !stage.closed)
    .map((stage) => ({ id: stage.code, title: stage.name, count: rows.filter((row) => !row.stageClosed && row.stageCode === stage.code).length }))
    .filter((chip) => chip.count > 0);
  const tags = LEAD_CONTACT_TAGS
    .map((tag) => ({ id: `${TAG_FILTER_PREFIX}${tag.code}`, title: tag.name, count: rows.filter((row) => row.contactTag === tag.code).length }))
    .filter((chip) => chip.count > 0);
  return [
    { id: "active", title: "Активные", count: rows.filter((row) => !row.stageClosed).length },
    { id: `${TAG_FILTER_PREFIX}none`, title: "Не звонили", count: rows.filter((row) => !row.stageClosed && !row.contactTag).length },
    ...tags,
    ...open,
    { id: "closed", title: "Закрытые", count: rows.filter((row) => row.stageClosed).length },
  ];
}

export type LeadSourceSummary = { source: string; label: string; total: number; byTag: Record<LeadContactTagCode, number>; untagged: number };

/**
 * The advertising view: per source, how many leads came in and how the calls went.
 * Sorted by volume so Meta, the site and calls are compared at a glance.
 */
export function leadSourceSummary(rows: LeadRow[]): LeadSourceSummary[] {
  const bySource = new Map<string, LeadSourceSummary>();
  for (const row of rows) {
    const key = row.source || "unknown";
    let item = bySource.get(key);
    if (!item) {
      item = { source: key, label: row.source ? row.sourceLabel : "Без источника", total: 0, byTag: { REACHED: 0, NOT_REACHED: 0, WRONG_PHONE: 0 }, untagged: 0 };
      bySource.set(key, item);
    }
    item.total += 1;
    if (row.contactTag) item.byTag[row.contactTag] += 1;
    else item.untagged += 1;
  }
  return [...bySource.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ru"));
}

/** Stages a person may choose for this lead: the manual ones plus the one it is in. */
export function stageChoices(row: LeadRow, stages: LeadStage[]) {
  const choices = stages.filter((stage) => stage.manual || stage.code === row.stageCode).map((stage) => ({ code: stage.code, name: stage.name }));
  if (!choices.some((choice) => choice.code === row.stageCode)) choices.unshift({ code: row.stageCode, name: row.stageName });
  return choices;
}
