const RESEND_API = "https://api.resend.com";
const UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export type MarketingEmailConfig = {
  configured: boolean;
  provider: "resend";
  from: string | null;
  replyTo: string | null;
};

function emailAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase();
}

export function marketingEmailConfig(): MarketingEmailConfig {
  const provider = (process.env.MARKETING_EMAIL_PROVIDER || "resend").trim().toLowerCase();
  if (provider !== "resend") throw new Error("Unsupported marketing email provider.");
  const apiKey = (process.env.MARKETING_EMAIL_API_KEY || "").trim();
  const from = (process.env.MARKETING_EMAIL_FROM || "").trim();
  const replyTo = (process.env.MARKETING_EMAIL_REPLY_TO || process.env.GMAIL_ALLOWED_ADDRESS || "info@rolan-pro.com").trim();
  const workMailbox = (process.env.GMAIL_ALLOWED_ADDRESS || "info@rolan-pro.com").trim().toLowerCase();
  if (from && emailAddress(from) === workMailbox) {
    throw new Error("Marketing sender must not be the main Google Workspace mailbox.");
  }
  return { configured: Boolean(apiKey && from), provider: "resend", from: from || null, replyTo: replyTo || null };
}

function marketingCredentials() {
  const config = marketingEmailConfig();
  const apiKey = (process.env.MARKETING_EMAIL_API_KEY || "").trim();
  if (!config.configured || !apiKey || !config.from) throw new Error("Marketing email is not configured.");
  return { ...config, apiKey, from: config.from };
}

function withUnsubscribe(html: string) {
  if (html.includes(UNSUBSCRIBE_TOKEN)) return html;
  return `${html}<p style="margin-top:32px;font-size:12px;color:#64748b">Не хотите получать такие письма? <a href="${UNSUBSCRIBE_TOKEN}">Отписаться</a>.</p>`;
}

export async function createMarketingBroadcast(input: {
  segmentId: string;
  topicId: string;
  subject: string;
  html: string;
  name?: string;
  send?: boolean;
  scheduledAt?: string | null;
}) {
  const credentials = marketingCredentials();
  if (!input.segmentId.trim() || !input.topicId.trim() || !input.subject.trim() || !input.html.trim()) {
    throw new Error("Segment, topic, subject, and HTML are required.");
  }
  const response = await fetch(`${RESEND_API}/broadcasts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      segment_id: input.segmentId.trim(),
      topic_id: input.topicId.trim(),
      from: credentials.from,
      reply_to: credentials.replyTo,
      subject: input.subject.trim(),
      html: withUnsubscribe(input.html.trim()),
      name: input.name?.trim() || undefined,
      send: Boolean(input.send),
      scheduled_at: input.scheduledAt?.trim() || undefined,
    }),
  });
  const payload = await response.json().catch(() => null) as null | { id?: string; message?: string; error?: { message?: string } };
  if (!response.ok || !payload?.id) throw new Error(payload?.message || payload?.error?.message || `Marketing email API ${response.status}.`);
  return { id: payload.id };
}
