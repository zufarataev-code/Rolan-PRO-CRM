import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeLeadIdentity } from "@/features/sales/lead-identity";
import { normalizePhoneE164 } from "@/features/google-ads/normalization";

export class MetaLeadError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetaLeadError("invalid_payload");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f]/.test(value)) throw new MetaLeadError("invalid_field");
  return value.trim();
}
export function metaId(value: unknown): string {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof id !== "string" || !/^\d{1,32}$/.test(id)) throw new MetaLeadError("invalid_id");
  return id;
}
export function verifyMetaSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"));
}
export type MetaLeadNotification = { lead_id: string; page_id: string; form_id: string; ad_id: string | null };

export function metaLeadNotifications(input: unknown, pageId: string, formIds: string[]) {
  const body = record(input);
  if (body.object !== "page" || !Array.isArray(body.entry)) throw new MetaLeadError("invalid_payload");
  const notifications: MetaLeadNotification[] = [];
  for (const item of body.entry) {
    const entry = record(item);
    if (metaId(entry.id) !== pageId) continue;
    if (!Array.isArray(entry.changes)) throw new MetaLeadError("invalid_payload");
    for (const item of entry.changes) {
      const change = record(item);
      if (change.field !== "leadgen") continue;
      const value = record(change.value);
      const formId = metaId(value.form_id);
      if (metaId(value.page_id) !== pageId || !formIds.includes(formId)) continue;
      notifications.push({ lead_id: metaId(value.leadgen_id), page_id: pageId, form_id: formId, ad_id: value.ad_id == null ? null : metaId(value.ad_id) });
    }
  }
  return notifications;
}

export function normalizeMetaLead(input: unknown, notification: MetaLeadNotification) {
  const lead = record(input);
  if (metaId(lead.id) !== notification.lead_id || metaId(lead.form_id) !== notification.form_id) throw new MetaLeadError("lead_scope_mismatch", 502);
  if (!Array.isArray(lead.field_data) || lead.field_data.length > 40) throw new MetaLeadError("invalid_fields", 502);
  const fields: Record<string, string> = Object.create(null);
  for (const item of lead.field_data) {
    const field = record(item), name = text(field.name, 255);
    if (!name || Object.hasOwn(fields, name) || !Array.isArray(field.values) || (field.values.length !== 1 && !(name === "email" && field.values.length === 0))) throw new MetaLeadError("invalid_fields", 502);
    fields[name] = field.values.length ? text(field.values[0], 1000) : "";
  }
  const identity = normalizeLeadIdentity({ name: fields.full_name, first_name: fields.first_name, last_name: fields.last_name });
  if ("error" in identity) throw new MetaLeadError("missing_name", 502);
  const phone = normalizePhoneE164(fields.phone_number);
  const emailValue = fields.email?.toLowerCase() || "";
  const email = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(emailValue) && emailValue.length <= 191 ? emailValue : null;
  if (!phone && !email) throw new MetaLeadError("missing_contact", 502);
  const createdAt = new Date(text(lead.created_time, 40));
  if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() > Date.now() + 300000) throw new MetaLeadError("invalid_created_time", 502);
  const optionalId = (value: unknown) => value == null ? null : metaId(value);
  const adId = optionalId(lead.ad_id) ?? notification.ad_id;
  if (notification.ad_id && adId !== notification.ad_id) throw new MetaLeadError("lead_scope_mismatch", 502);
  const metadata = {
    provider: "meta_lead_ads", page_id: notification.page_id, form_id: notification.form_id,
    leadgen_id: notification.lead_id, ad_id: adId, adset_id: optionalId(lead.adset_id), campaign_id: optionalId(lead.campaign_id),
    campaign_name: lead.campaign_name == null ? null : text(lead.campaign_name, 255),
    adset_name: lead.adset_name == null ? null : text(lead.adset_name, 255),
    ad_name: lead.ad_name == null ? null : text(lead.ad_name, 255),
    platform: lead.platform == null ? null : text(lead.platform, 40),
    is_organic: typeof lead.is_organic === "boolean" ? lead.is_organic : null,
  };
  const contactKeys = new Set(["full_name", "first_name", "last_name", "phone_number", "email"]);
  const answers = Object.entries(fields).filter(([key]) => !contactKeys.has(key)).map(([key, value]) => `${key}: ${value}`);
  const notes = ["Meta instant form quote request", ...answers,
    `Campaign: ${metadata.campaign_name || metadata.campaign_id || "Unknown"}`,
    `Ad set: ${metadata.adset_name || metadata.adset_id || "Unknown"}`,
    `Ad: ${metadata.ad_name || adId || "Unknown"}`, `Form: ${notification.form_id}`].join("\n");
  return { ...identity, phone, email, createdAt, notes, metadata };
}
