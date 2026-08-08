import type { GmailConnection, Prisma } from "@prisma/client";

import { decryptGmailToken, encryptGmailToken } from "@/features/gmail/crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const CONNECTION_KEY = "primary";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessageResource = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function gmailOAuthConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("Gmail OAuth is not configured.");
  return {
    clientId,
    clientSecret,
    redirectUri: `${getEnv().appUrl.replace(/\/$/, "")}/api/v1/integrations/gmail/callback`,
  };
}

export function gmailAuthorizationUrl(state: string) {
  const config = gmailOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: URLSearchParams): Promise<GmailTokenResponse & { access_token: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const data = await response.json() as GmailTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed.");
  }
  return data as GmailTokenResponse & { access_token: string };
}

export async function connectGmailAccount(code: string, connectedBy: string) {
  const config = gmailOAuthConfig();
  const tokens = await tokenRequest(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  }));
  const profileResponse = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  const profile = await profileResponse.json() as { emailAddress?: string; historyId?: string; error?: { message?: string } };
  if (!profileResponse.ok || !profile.emailAddress) throw new Error(profile.error?.message || "Gmail profile unavailable.");
  const allowedAddress = (process.env.GMAIL_ALLOWED_ADDRESS || "info@rolan-pro.com").trim().toLowerCase();
  if (profile.emailAddress.toLowerCase() !== allowedAddress) {
    throw new Error(`Connect the company mailbox ${allowedAddress}, not ${profile.emailAddress}.`);
  }

  const existing = await prisma.gmailConnection.findUnique({ where: { connection_key: CONNECTION_KEY } });
  const refreshToken = tokens.refresh_token || (existing ? decryptGmailToken(existing.refresh_token_encrypted) : "");
  if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect the mailbox and approve offline access.");
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  return prisma.gmailConnection.upsert({
    where: { connection_key: CONNECTION_KEY },
    create: {
      connection_key: CONNECTION_KEY,
      email_address: profile.emailAddress.toLowerCase(),
      access_token_encrypted: encryptGmailToken(tokens.access_token),
      refresh_token_encrypted: encryptGmailToken(refreshToken),
      token_expires_at: expiresAt,
      scope: tokens.scope || GMAIL_SCOPE,
      history_id: profile.historyId || null,
      connected_by: connectedBy,
      is_active: true,
    },
    update: {
      email_address: profile.emailAddress.toLowerCase(),
      access_token_encrypted: encryptGmailToken(tokens.access_token),
      refresh_token_encrypted: encryptGmailToken(refreshToken),
      token_expires_at: expiresAt,
      scope: tokens.scope || GMAIL_SCOPE,
      history_id: profile.historyId || existing?.history_id || null,
      connected_by: connectedBy,
      sync_error: null,
      is_active: true,
    },
  });
}

export async function primaryGmailConnection() {
  return prisma.gmailConnection.findUnique({ where: { connection_key: CONNECTION_KEY } });
}

async function activeAccessToken(connection: GmailConnection) {
  if (connection.token_expires_at && connection.token_expires_at.getTime() > Date.now() + 60_000) {
    return decryptGmailToken(connection.access_token_encrypted);
  }
  const config = gmailOAuthConfig();
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: decryptGmailToken(connection.refresh_token_encrypted),
    grant_type: "refresh_token",
  }));
  await prisma.gmailConnection.update({
    where: { gmail_connection_id: connection.gmail_connection_id },
    data: {
      access_token_encrypted: encryptGmailToken(tokens.access_token!),
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      scope: tokens.scope || connection.scope,
      sync_error: null,
    },
  });
  return tokens.access_token!;
}

async function gmailRequest<T>(connection: GmailConnection, path: string, init?: RequestInit) {
  const token = await activeAccessToken(connection);
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Gmail API error ${response.status}.`);
  return data;
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return "";
  return Buffer.from(value, "base64url").toString("utf8");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function gmailPartText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data).trim();
  for (const child of part.parts || []) {
    const text = gmailPartText(child);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data) return htmlToText(decodeBase64Url(part.body.data));
  return "";
}

function attachmentMeta(part: GmailPart | undefined): Array<{ name: string; mime_type: string; size: number; attachment_id: string | null }> {
  if (!part) return [];
  const current = part.filename ? [{
    name: part.filename,
    mime_type: part.mimeType || "application/octet-stream",
    size: Number(part.body?.size || 0),
    attachment_id: part.body?.attachmentId || null,
  }] : [];
  return current.concat((part.parts || []).flatMap(attachmentMeta));
}

export function parseEmailAddresses(value: string) {
  return value.split(",").map(part => {
    const match = part.match(/^(.*?)\s*<([^>]+)>$/);
    return (match?.[2] || part).trim().toLowerCase();
  }).filter(address => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
}

function senderParts(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return {
    name: (match?.[1] || "").replace(/^"|"$/g, "").trim() || null,
    email: (match?.[2] || value).trim().toLowerCase() || null,
  };
}

async function matchLegacyRecord(addresses: string[]) {
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
  const payload = workspace?.payload && typeof workspace.payload === "object" && !Array.isArray(workspace.payload)
    ? workspace.payload as Record<string, unknown>
    : null;
  const clients = Array.isArray(payload?.clients) ? payload.clients as Array<Record<string, unknown>> : [];
  const client = clients.find(item => addresses.includes(String(item.email || "").trim().toLowerCase()));
  if (!client) return { clientId: null, orderId: null };
  const orders = (Array.isArray(payload?.orders) ? payload.orders as Array<Record<string, unknown>> : [])
    .filter(order => order.clientId === client.id)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return { clientId: String(client.id || "") || null, orderId: String(orders[0]?.id || "") || null };
}

async function storeMessage(connection: GmailConnection, message: GmailMessageResource, explicit?: { orderId?: string | null; clientId?: string | null }) {
  if (!message.id || !message.threadId) return null;
  const headers = message.payload?.headers || [];
  const from = senderParts(headerValue(headers, "From"));
  const recipients = parseEmailAddresses(headerValue(headers, "To"));
  const cc = parseEmailAddresses(headerValue(headers, "Cc"));
  const direction = (message.labelIds || []).includes("SENT") ? "outbound" : "inbound";
  const externalAddresses = [from.email, ...recipients, ...cc]
    .filter((email): email is string => Boolean(email && email !== connection.email_address));
  const matched = await matchLegacyRecord(externalAddresses);
  return prisma.gmailMessage.upsert({
    where: { gmail_message_id: message.id },
    create: {
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      gmail_connection_id: connection.gmail_connection_id,
      direction,
      sender_email: from.email,
      sender_name: from.name,
      recipient_emails: recipients,
      cc_emails: cc,
      subject: headerValue(headers, "Subject").slice(0, 500),
      snippet: message.snippet || "",
      body_text: gmailPartText(message.payload),
      label_ids: message.labelIds || [],
      is_unread: (message.labelIds || []).includes("UNREAD"),
      sent_at: new Date(Number(message.internalDate || Date.now())),
      legacy_client_id: explicit?.clientId || matched.clientId,
      legacy_order_id: explicit?.orderId || matched.orderId,
      raw_headers: Object.fromEntries(headers.filter(h => h.name).map(h => [h.name!, h.value || ""])) as Prisma.InputJsonValue,
      attachment_meta: attachmentMeta(message.payload) as Prisma.InputJsonValue,
    },
    update: {
      label_ids: message.labelIds || [],
      is_unread: (message.labelIds || []).includes("UNREAD"),
      legacy_client_id: explicit?.clientId || matched.clientId,
      legacy_order_id: explicit?.orderId || matched.orderId,
    },
  });
}

export async function syncPrimaryGmail() {
  const connection = await primaryGmailConnection();
  if (!connection?.is_active) throw new Error("Gmail is not connected.");
  try {
    const list = await gmailRequest<{ messages?: Array<{ id?: string }>; resultSizeEstimate?: number }>(
      connection,
      "/messages?maxResults=100&q=newer_than%3A30d",
    );
    let newestHistoryId = connection.history_id;
    for (const item of list.messages || []) {
      if (!item.id) continue;
      const message = await gmailRequest<GmailMessageResource>(connection, `/messages/${encodeURIComponent(item.id)}?format=full`);
      newestHistoryId = message.historyId || newestHistoryId;
      await storeMessage(connection, message);
    }
    await prisma.gmailConnection.update({
      where: { gmail_connection_id: connection.gmail_connection_id },
      data: { last_synced_at: new Date(), history_id: newestHistoryId, sync_error: null },
    });
    return { synced: list.messages?.length || 0, estimated: list.resultSizeEstimate || 0 };
  } catch (error) {
    await prisma.gmailConnection.update({
      where: { gmail_connection_id: connection.gmail_connection_id },
      data: { sync_error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function encodeGmailHeader(value: string) {
  const safe = safeHeader(value);
  if (/^[\x20-\x7E]*$/.test(safe)) return safe;

  const chunks: string[] = [];
  let current = "";
  for (const character of Array.from(safe)) {
    if (current && Buffer.byteLength(current + character, "utf8") > 42) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`)
    .join("\r\n ");
}

export function buildRawGmailMessage(input: { from: string; to: string; subject: string; body: string; inReplyTo?: string | null }) {
  const headers = [
    `From: ${safeHeader(input.from)}`,
    `To: ${safeHeader(input.to)}`,
    `Subject: ${encodeGmailHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${safeHeader(input.inReplyTo)}`, `References: ${safeHeader(input.inReplyTo)}`);
  }
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.body}`, "utf8").toString("base64url");
}

export async function sendPrimaryGmail(input: {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  legacyOrderId?: string | null;
  legacyClientId?: string | null;
}) {
  const connection = await primaryGmailConnection();
  if (!connection?.is_active) throw new Error("Gmail is not connected.");
  const result = await gmailRequest<GmailMessageResource>(connection, "/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: buildRawGmailMessage({
        from: connection.email_address,
        to: input.to,
        subject: input.subject,
        body: input.body,
        inReplyTo: input.inReplyTo,
      }),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  });
  if (!result.id) throw new Error("Gmail did not return the sent message id.");
  const full = await gmailRequest<GmailMessageResource>(connection, `/messages/${encodeURIComponent(result.id)}?format=full`);
  await storeMessage(connection, full, { orderId: input.legacyOrderId, clientId: input.legacyClientId });
  return full;
}

export async function markGmailMessageRead(messageId: string) {
  const connection = await primaryGmailConnection();
  if (!connection?.is_active) throw new Error("Gmail is not connected.");
  const stored = await prisma.gmailMessage.findUnique({ where: { gmail_message_id: messageId } });
  if (!stored || stored.gmail_connection_id !== connection.gmail_connection_id) throw new Error("Gmail message was not found.");
  await gmailRequest(connection, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  return prisma.gmailMessage.update({
    where: { gmail_message_id: messageId },
    data: { is_unread: false, label_ids: { set: stored.label_ids.filter(label => label !== "UNREAD") } },
  });
}

export async function getGmailAttachment(messageId: string, attachmentId: string) {
  const connection = await primaryGmailConnection();
  if (!connection?.is_active) throw new Error("Gmail is not connected.");
  const stored = await prisma.gmailMessage.findUnique({ where: { gmail_message_id: messageId } });
  if (!stored || stored.gmail_connection_id !== connection.gmail_connection_id) throw new Error("Gmail message was not found.");
  const files = Array.isArray(stored.attachment_meta) ? stored.attachment_meta as Array<Record<string, unknown>> : [];
  const file = files.find(item => item.attachment_id === attachmentId);
  if (!file) throw new Error("Gmail attachment was not found.");
  const result = await gmailRequest<{ data?: string; size?: number }>(
    connection,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  if (!result.data) throw new Error("Gmail attachment data is empty.");
  return {
    data: Buffer.from(result.data, "base64url"),
    name: String(file.name || "attachment"),
    mimeType: String(file.mime_type || "application/octet-stream"),
  };
}
