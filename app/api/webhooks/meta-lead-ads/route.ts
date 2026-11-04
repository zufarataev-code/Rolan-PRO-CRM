import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { MetaLeadError, metaId, metaLeadNotifications, verifyMetaSignature } from "@/features/integrations/meta-lead-ads-core";
import { importMetaLead } from "@/features/integrations/meta-lead-ads";

export const runtime = "nodejs";
const MAX_BODY = 128 * 1024;
export async function GET(request: Request) {
  const token = process.env.META_LEAD_ADS_VERIFY_TOKEN?.trim();
  if (!token) return new NextResponse(null, { status: 503 });
  const params = new URL(request.url).searchParams;
  const supplied = Buffer.from(params.get("hub.verify_token") || "");
  const expected = Buffer.from(token);
  const challenge = params.get("hub.challenge") || "";
  if (params.get("hub.mode") !== "subscribe" || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || !/^\d{1,100}$/.test(challenge)) return new NextResponse(null, { status: 403 });
  return new NextResponse(challenge, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const secret = process.env.META_LEAD_ADS_APP_SECRET?.trim();
  const token = process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN?.trim();
  const pageId = process.env.META_LEAD_ADS_PAGE_ID?.trim();
  const forms = process.env.META_LEAD_ADS_FORM_IDS?.split(",").map(value => value.trim()).filter(Boolean);
  if (!secret || !token || !pageId || !forms?.length) return NextResponse.json({ ok: false, error: "integration_not_configured" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > MAX_BODY) return new NextResponse(null, { status: 413 });
  const chunks: Uint8Array[] = [], reader = request.body?.getReader();
  let bytes = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BODY) { await reader.cancel(); return new NextResponse(null, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  let input: unknown;
  try { input = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  try {
    metaId(pageId); forms.forEach(metaId);
    const notifications = metaLeadNotifications(input, pageId, forms);
    // shortcut: synchronous reads; use a durable queue if batches exceed Meta's response window.
    for (const notification of notifications) await importMetaLead(notification, token, secret);
    // Acknowledge only after every scoped lead commits; Meta can retry partial batches safely.
    return NextResponse.json({ ok: true, received: notifications.length });
  } catch (cause) {
    console.error("meta_lead_ads_ingest_failed");
    return NextResponse.json({ ok: false, error: cause instanceof MetaLeadError ? cause.code : "lead_ingest_failed" }, { status: cause instanceof MetaLeadError ? cause.status : 503 });
  }
}
