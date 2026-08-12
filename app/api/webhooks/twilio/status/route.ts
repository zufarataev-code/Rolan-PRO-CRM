import { updateMessageStatus, validateTwilioWebhook } from "@/features/twilio/service";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
  if (!validateTwilioWebhook(request, params)) return new Response("Invalid signature", { status: 403 });
  await updateMessageStatus(params);
  return new Response(null, { status: 204 });
}
