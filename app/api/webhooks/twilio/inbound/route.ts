import { handleLeadSmsReply } from "@/features/sales/lead-first-touch";
import { handleInboundWhatsApp } from "@/features/sales/whatsapp-bot";
import { detectTwilioChannel, recordIncomingSms, validateTwilioWebhook } from "@/features/twilio/service";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
  if (!validateTwilioWebhook(request, params)) return new Response("Invalid signature", { status: 403 });
  await recordIncomingSms(params);
  const messageSid = params.MessageSid || params.SmsSid || "";
  if (detectTwilioChannel(params.From) === "whatsapp") {
    // Answer Twilio right away; the lead + bot reply run on the long-lived server.
    void handleInboundWhatsApp({
      from: params.From || "",
      body: params.Body || "",
      messageSid,
      profileName: params.ProfileName || null,
      numMedia: Number(params.NumMedia ?? 0),
    });
  } else {
    await handleLeadSmsReply({ from: params.From || "", body: params.Body || "", messageSid });
  }
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
