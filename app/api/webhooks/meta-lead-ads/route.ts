import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { MetaLeadError, metaId, metaLeadNotifications, verifyMetaSignature } from "@/features/integrations/meta-lead-ads-core";
import { importMetaLead } from "@/features/integrations/meta-lead-ads";
import { ingestMetaComment, metaCommentConfig } from "@/features/integrations/meta-comments";
import { MetaCommentError, metaCommentNotifications } from "@/features/integrations/meta-comments-core";

export const runtime = "nodejs";
const MAX_BODY = 128 * 1024;
export async function GET(request: Request) {
  const token = process.env.META_LEAD_ADS_VERIFY_TOKEN?.trim()
    || process.env.META_COMMENTS_VERIFY_TOKEN?.trim();
  if (!token) return new NextResponse(null, { status: 503 });
  const params = new URL(request.url).searchParams;
  const supplied = Buffer.from(params.get("hub.verify_token") || "");
  const expected = Buffer.from(token);
  const challenge = params.get("hub.challenge") || "";
  if (params.get("hub.mode") !== "subscribe" || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || !/^\d{1,100}$/.test(challenge)) return new NextResponse(null, { status: 403 });
  return new NextResponse(challenge, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const commentConfig = metaCommentConfig();
  const secret = commentConfig.appSecret;
  const leadSecret = process.env.META_LEAD_ADS_APP_SECRET?.trim() || "";
  const leadVerifyToken = process.env.META_LEAD_ADS_VERIFY_TOKEN?.trim() || "";
  const leadToken = process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN?.trim() || "";
  const leadPageId = process.env.META_LEAD_ADS_PAGE_ID?.trim() || "";
  const pageId = commentConfig.pageId;
  const forms = process.env.META_LEAD_ADS_FORM_IDS?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const leadValuesPresent = [leadSecret, leadVerifyToken, leadToken, leadPageId, ...forms].some(Boolean);
  const leadConfigured = Boolean(leadSecret && leadVerifyToken && leadToken && leadPageId && forms.length);
  if (
    !secret ||
    !pageId ||
    (leadValuesPresent && !leadConfigured) ||
    (!leadConfigured && !commentConfig.webhookConfigured)
  ) return NextResponse.json({ ok: false, error: "integration_not_configured" }, { status: 503 });
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
    const notifications = leadConfigured ? metaLeadNotifications(input, pageId, forms) : [];
    const comments = metaCommentNotifications(input, pageId);
    // shortcut: synchronous reads; use a durable queue if batches exceed Meta's response window.
    for (const notification of notifications) await importMetaLead(notification, leadToken, leadSecret);
    for (const comment of comments) await ingestMetaComment(comment);
    // Acknowledge only after every scoped lead commits; Meta can retry partial batches safely.
    return NextResponse.json({ ok: true, received: notifications.length, comments_received: comments.length });
  } catch (cause) {
    console.error("meta_webhook_ingest_failed");
    const known = cause instanceof MetaLeadError || cause instanceof MetaCommentError;
    return NextResponse.json({ ok: false, error: known ? cause.code : "meta_ingest_failed" }, { status: known ? cause.status : 503 });
  }
}
