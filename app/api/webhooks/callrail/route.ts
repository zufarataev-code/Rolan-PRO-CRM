import { NextResponse } from "next/server";
import { CallrailError, callrailPayloadTypes, normalizeCallrailCall, verifyCallrailSignature } from "@/features/integrations/callrail-core";
import { importCallrailCall } from "@/features/integrations/callrail";

export const runtime = "nodejs";
const MAX_BODY = 128 * 1024;
export async function POST(request: Request) {
  const key = process.env.CALLRAIL_WEBHOOK_SIGNING_KEY?.trim();
  const companyId = process.env.CALLRAIL_COMPANY_ID?.trim();
  if (!key || !companyId) return NextResponse.json({ ok: false, error: "integration_not_configured" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > MAX_BODY) return new NextResponse(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BODY) { await reader.cancel(); return new NextResponse(null, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  if (!verifyCallrailSignature(raw, request.headers.get("signature"), key)) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  let input: unknown;
  try { input = JSON.parse(raw.toString("utf8")); } catch {
    console.warn("callrail_rejected", "invalid_json", { bytes: raw.length });
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  try {
    const call = normalizeCallrailCall(input, companyId);
    if (!call) return NextResponse.json({ ok: true, ignored: true });
    return NextResponse.json({ ok: true, ...await importCallrailCall(call) });
  } catch (cause) {
    if (cause instanceof CallrailError) {
      console.warn("callrail_rejected", cause.code, callrailPayloadTypes(input));
      return NextResponse.json({ ok: false, error: cause.code }, { status: cause.status });
    }
    console.error("callrail_ingest_failed");
    return NextResponse.json({ ok: false, error: "call_ingest_failed" }, { status: 500 });
  }
}
