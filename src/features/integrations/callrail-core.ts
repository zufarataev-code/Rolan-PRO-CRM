import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhoneE164 } from "@/features/google-ads/normalization";
import { captureGoogleAdsUrl } from "@/features/google-ads/browser-attribution";
import type { AttributionCaptureInput } from "@/features/google-ads/types";

export const CALLRAIL_ACTION = "integration.callrail.call";
export class CallrailError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 255) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function id(value: unknown) {
  const result = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : text(value, 191);
  return /^[A-Za-z0-9_-]{1,191}$/.test(result) ? result : "";
}
export function verifyCallrailSignature(raw: string | Uint8Array, signature: string | null, key: string) {
  if (!key || !signature || !/^[A-Za-z0-9+/]{27}=$/.test(signature)) return false;
  const expected = createHmac("sha1", key).update(raw).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Read only CallRail's signed post-call object, never its AI qualification or recording. */
export function normalizeCallrailCall(input: unknown, companyId: string, now = new Date()) {
  const body = record(input);
  if (!companyId || id(body.company_id) !== companyId) throw new CallrailError("wrong_company", "Unexpected CallRail company.", 403);
  if (body.direction !== "inbound") return null;
  const callId = id(body.id);
  const start = text(body.start_time, 64);
  const duration = typeof body.duration === "number" || (typeof body.duration === "string" && /^\d+$/.test(body.duration)) ? Number(body.duration) : NaN;
  if (!callId || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(start) || !Number.isFinite(Date.parse(start)) || Date.parse(start) > now.getTime() + 300_000 || !Number.isInteger(duration) || duration < 0 || duration > 604800 || typeof body.answered !== "boolean") {
    throw new CallrailError("invalid_call", "A completed call ID, start time, duration and answered flag are required.");
  }
  const rawPhone = text(body.customer_phone_number, 40);
  const phone = /^[+\d(). -]+$/.test(rawPhone) ? normalizePhoneE164(rawPhone) : null;
  const source = text(body.source_name) || "Unknown";
  const callType = text(body.call_type, 60) || (body.answered ? "answered" : "unanswered");
  const metadata = { call_key: `${companyId}:${callId}`, call_id: callId, company_id: companyId, started_at: new Date(start).toISOString(), duration, answered: body.answered, spam: body.spam === true || body.spam === "true", call_type: callType, source, tracking_phone_number: text(body.tracking_phone_number, 40), campaign: text(body.campaign) };

  // CallRail's top-level GCLID can differ from its first-touch campaign. Join
  // campaign/UTM details only to a milestone carrying that same click ID.
  const gclid = text(body.gclid, 2048);
  const milestones = record(body.milestones);
  const points = [milestones.lead_created, milestones.first_touch, milestones.last_touch].map(record);
  function landing(point: Record<string, unknown>) {
    try {
      const url = new URL(text(point.landing, 4096));
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch { return null; }
  }
  const matched = gclid ? points.find(point => landing(point)?.searchParams.get("gclid") === gclid || record(point.landing_page_url_params).gclid === gclid) : undefined;
  const fallback = { landing: body.landing_page_url, event_date: body.start_time, source: body.source_name, medium: body.medium, campaign: body.campaign };
  const fallbackUrl = landing(fallback);
  const point = matched || (!gclid ? points.find(item => landing(item)) || (fallbackUrl ? fallback : undefined) : (fallbackUrl?.searchParams.get("gclid") === gclid ? fallback : undefined));
  const url = point ? landing(point) : null;
  const captured = point && Number.isFinite(Date.parse(text(point.event_date))) && Date.parse(text(point.event_date)) <= Date.parse(start) ? new Date(text(point.event_date)) : new Date(start);
  const fields = url ? captureGoogleAdsUrl(url.href, captured) : null;
  const attribution: AttributionCaptureInput = {
    gclid: gclid || fields?.gclid || null,
    gbraid: fields?.gbraid, wbraid: fields?.wbraid,
    googleAdsCustomerId: fields?.google_ads_customer_id,
    googleAdsCampaignId: fields?.google_ads_campaign_id,
    landingPage: fields?.landing_page,
    utmSource: fields?.utm_source || (point ? (/^Google (?:Ads|AdWords|Paid)$/i.test(text(point.source)) ? "google" : text(point.source)) : null),
    utmMedium: fields?.utm_medium || (point ? text(point.medium) : null),
    utmCampaign: fields?.utm_campaign || (point ? text(point.campaign) : null),
    utmTerm: fields?.utm_term, utmContent: fields?.utm_content,
    capturedAt: captured,
    sessionAttributes: { provider: "callrail", source_channel: "PHONE", call_id: callId, call_source: source },
    // A call or provider's "good lead" label is not advertising consent.
    consent: { adUserData: "UNKNOWN", adPersonalization: "UNKNOWN", audienceMarketingEligible: false, source: "callrail" },
  };
  return { ...metadata, phone, name: text(body.customer_name, 160) || (phone ? "CallRail caller" : "CallRail caller (number withheld)"), attribution };
}
export type CallrailCall = NonNullable<ReturnType<typeof normalizeCallrailCall>>;
