import { recordIncomingSms, validateTwilioWebhook } from "@/features/twilio/service";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
  if (!validateTwilioWebhook(request, params)) return new Response("Invalid signature", { status: 403 });
  await recordIncomingSms(params);
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
