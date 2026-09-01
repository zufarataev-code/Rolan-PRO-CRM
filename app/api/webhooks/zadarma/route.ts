import { recordZadarmaWebhook, validateZadarmaWebhook } from "@/features/zadarma/service";

async function payloadFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, String(value ?? "")]));
  }
  const form = await request.formData();
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
}

export async function GET(request: Request) {
  const echo = new URL(request.url).searchParams.get("zd_echo");
  return echo ? new Response(echo, { status: 200 }) : new Response("Zadarma webhook", { status: 200 });
}

export async function POST(request: Request) {
  const payload = await payloadFromRequest(request);
  if (!validateZadarmaWebhook(payload, request.headers.get("signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const call = await recordZadarmaWebhook(payload);
  return Response.json({ ok: true, callId: call?.pbx_call_id ?? null });
}
