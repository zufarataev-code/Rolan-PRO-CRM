import { NextResponse } from "next/server";

import { PlaudError, normalizePlaudPayload, plaudTokenMatches } from "@/features/integrations/plaud-core";
import { importPlaudRecording } from "@/features/integrations/plaud";

export const runtime = "nodejs";
const MAX_BODY = 1024 * 1024;

/** Zapier: Plaud «Transcript & Summary Ready» → Webhooks POST (JSON) here. */
export async function POST(request: Request) {
  const secret = process.env.PLAUD_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "integration_not_configured" }, { status: 503 });
  const header = request.headers.get("authorization") || request.headers.get("x-plaud-token");
  if (!plaudTokenMatches(header, secret)) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  if (Number(request.headers.get("content-length")) > MAX_BODY) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...await importPlaudRecording(normalizePlaudPayload(input)) });
  } catch (cause) {
    if (cause instanceof PlaudError) return NextResponse.json({ ok: false, error: cause.code }, { status: cause.status });
    console.error("plaud_ingest_failed");
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}
