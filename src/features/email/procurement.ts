const RESEND_API = "https://api.resend.com";

function emailAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase();
}

export function procurementEmailConfig() {
  const apiKey = (process.env.PROCUREMENT_EMAIL_API_KEY || process.env.MARKETING_EMAIL_API_KEY || "").trim();
  const from = (process.env.PROCUREMENT_EMAIL_FROM || process.env.MARKETING_EMAIL_FROM || "").trim();
  const replyTo = (
    process.env.PROCUREMENT_EMAIL_REPLY_TO ||
    process.env.MARKETING_EMAIL_REPLY_TO ||
    process.env.GMAIL_ALLOWED_ADDRESS ||
    "info@rolan-pro.com"
  ).trim();
  const workMailbox = (process.env.GMAIL_ALLOWED_ADDRESS || "info@rolan-pro.com").trim().toLowerCase();
  if (from && emailAddress(from) === workMailbox) {
    throw new Error("Procurement sender must not be the main Google Workspace mailbox.");
  }
  return { configured: Boolean(apiKey && from), provider: "resend" as const, from: from || null, replyTo: replyTo || null };
}

export async function sendProcurementEmail(input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) {
  const config = procurementEmailConfig();
  const apiKey = (process.env.PROCUREMENT_EMAIL_API_KEY || process.env.MARKETING_EMAIL_API_KEY || "").trim();
  if (!config.configured || !apiKey || !config.from) throw new Error("Procurement email is not configured.");
  const response = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      reply_to: config.replyTo,
      subject: input.subject,
      text: input.text,
    }),
  });
  const payload = await response.json().catch(() => null) as null | { id?: string; message?: string; error?: { message?: string } };
  if (!response.ok || !payload?.id) throw new Error(payload?.message || payload?.error?.message || `Procurement email API ${response.status}.`);
  return { id: payload.id };
}
