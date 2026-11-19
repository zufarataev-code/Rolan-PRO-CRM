import { normalizePhoneE164, sha256Hex } from "@/features/google-ads/normalization";

export const META_GRAPH_VERSION = "v26.0";
export const META_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const META_STAGE_EVENTS: Record<string, string> = {
  NEW_LEAD: "Lead", LEAD: "Lead", CONTACTING: "ContactAttempted", CONTACTED: "Contact",
  QUALIFIED: "QualifiedLead", CONSULTATION_SCHEDULED: "ConsultationScheduled",
  CONSULTATION_COMPLETED: "ConsultationCompleted", SURVEY_COMPLETED: "SurveyCompleted",
  PROPOSAL_DRAFT: "ProposalDraft", PROPOSAL_SENT: "ProposalSent", APPROVED: "ProposalApproved",
  PROPOSAL_UPDATED_BY_CLIENT: "ProposalUpdated", AGREEMENT_SIGNED: "AgreementSigned",
  DEPOSIT_PENDING: "DepositPending", DEPOSIT_PAID: "DepositPaid", PROJECT_CREATED: "ProjectCreated",
  CLOSED_WON: "ConvertedLead", DISQUALIFIED: "DisqualifiedLead", CLOSED_LOST: "LostLead", SPAM: "SpamLead",
  SCHEDULED: "InstallationScheduled", IN_PROGRESS: "InstallationStarted", COMPLETED: "InstallationCompleted",
  FINAL_PAYMENT_PENDING: "FinalPaymentPending", PAID: "PaymentReceived", WARRANTY_SERVICE: "WarrantyService",
};

export type MetaEventPayload = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "system_generated";
  user_data: { fbc?: string; lead_id?: string; em?: string[]; ph?: string[] };
  custom_data: { event_source?: "crm"; lead_event_source?: "RolanPRO CRM"; value?: number; currency?: string };
};

type Input = {
  source: string | null;
  nativeLeadId: string | null;
  websiteClick?: { meta_fbclid: string | null; captured_at: Date };
  email: string | null;
  phone: string | null;
  consent: string | null;
  eventName: string;
  eventId: string;
  occurredAt: Date;
  generatedAt: Date;
  value?: number;
  currency?: string;
};

/** Native forms use CRM optimization; other sources use ordinary CRM stage feedback. */
export function buildMetaCrmPayload(input: Input): { payload: MetaEventPayload | null; reason: string | null } {
  const native = input.source === "meta_lead_ads";
  const website = input.source === "website";
  const phone = ["callrail", "phone", "phone_call"].includes(input.source ?? "");
  if (!native && !website && !phone) return { payload: null, reason: "unsupported_source" };
  if (input.consent === "DENIED") return { payload: null, reason: "consent_denied" };
  if (!native && input.consent !== "GRANTED") return { payload: null, reason: "consent_not_granted" };
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt < input.generatedAt) return { payload: null, reason: "invalid_event_time" };
  const user: MetaEventPayload["user_data"] = {};
  if (native && input.nativeLeadId && /^\d{15,17}$/.test(input.nativeLeadId)) user.lead_id = input.nativeLeadId;
  // Unknown consent permits the existing native lead reference, never contact matching.
  if (input.consent === "GRANTED") {
    const click = input.websiteClick;
    if (website && click?.meta_fbclid && click.captured_at <= input.occurredAt) {
      user.fbc = `fb.1.${click.captured_at.getTime()}.${click.meta_fbclid}`;
    }
    const email = input.email?.trim().toLowerCase();
    const phoneNumber = normalizePhoneE164(input.phone)?.slice(1);
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) user.em = [sha256Hex(email)];
    if (phoneNumber) user.ph = [sha256Hex(phoneNumber)];
  }
  if (!Object.keys(user).length) return { payload: null, reason: "missing_matching_data" };
  const custom: MetaEventPayload["custom_data"] = native ? { event_source: "crm", lead_event_source: "RolanPRO CRM" } : {};
  if (input.eventName === "ConvertedLead") {
    if (!Number.isFinite(input.value) || !(input.value! > 0) || !/^[A-Z]{3}$/.test(input.currency ?? "")) return { payload: null, reason: "unverified_sale_value" };
    custom.value = input.value;
    custom.currency = input.currency;
  }
  return { reason: null, payload: { event_name: input.eventName, event_time: Math.floor(input.occurredAt.getTime() / 1000), event_id: input.eventId, action_source: "system_generated", user_data: user, custom_data: custom } };
}

export function metaEventTimeError(occurredAt: Date, now: Date) {
  const age = now.getTime() - occurredAt.getTime();
  if (!Number.isFinite(age) || age < -5 * 60 * 1000) return "invalid_event_time";
  return age > META_EVENT_MAX_AGE_MS ? "event_too_old" : null;
}

export function metaRetryDelayMs(attempt: number) {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(12, Math.max(0, attempt - 1)));
}
