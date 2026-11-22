import { onLeadCreated } from "@/features/core/events";
import { normalizeContactPhone } from "@/features/integrations/facebook-messenger-core";
import {
  acquireFacebookMessengerLock,
  resolveFacebookMessengerActorAndManager,
  type FacebookMessengerDbClient,
} from "@/features/integrations/facebook-messenger-db";
import { getTwilioConfig, sendWhatsApp } from "@/features/twilio/service";
import { requestAnthropicMessage, resolveAnthropicModel } from "@/lib/anthropic/client";
import { prisma } from "@/lib/db";

import {
  buildWhatsAppSystemPrompt,
  humanTookOver,
  parseWhatsAppBotOutput,
  toAnthropicMessages,
  WHATSAPP_BOT_KIND,
  WHATSAPP_LEAD_SOURCE,
  whatsappLeadName,
  type WhatsAppHistoryItem,
} from "./whatsapp-bot-core";

const INBOUND_ACTION = "lead.whatsapp_inbound";
const REPLY_ACTION = "lead.whatsapp_bot_reply";

type InboundWhatsApp = {
  from: string;
  body: string;
  messageSid: string;
  profileName?: string | null;
  numMedia?: number;
};

function last10(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

async function notify(recipientUserId: string | null, leadId: string, typeKey: string, title: string, message: string) {
  if (!recipientUserId) return;
  await prisma.notification.create({
    data: {
      recipient_user_id: recipientUserId,
      entity_type: "lead",
      entity_id: leadId,
      type_key: typeKey,
      title: title.slice(0, 180),
      message: message.slice(0, 2000),
    },
  });
}

/** Find the customer's lead by phone or create a new WhatsApp lead. */
async function ensureWhatsAppLead(phone: string, profileName: string | null | undefined) {
  const digits = last10(phone);
  return prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    await acquireFacebookMessengerLock(tx, "rolanpro-whatsapp-contact", digits);
    const candidates = await tx.lead.findMany({
      where: { phone: { contains: digits.slice(-7) } },
      select: { lead_id: true, name: true, phone: true, assigned_manager_id: true },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    const existing = candidates.find((lead: { phone: string | null }) => last10(lead.phone) === digits);
    if (existing) return { lead: existing, created: false };

    const { actor, manager } = await resolveFacebookMessengerActorAndManager(tx);
    const pipelineStatus =
      (await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" } })) ??
      (await tx.pipelineStatus.findUnique({ where: { status_code: "LEAD" } }));
    if (!pipelineStatus) throw new Error("Pipeline status for new leads is not configured.");

    const name = whatsappLeadName(profileName, phone);
    const lead = await tx.lead.create({
      data: {
        name,
        phone: normalizeContactPhone(phone),
        source: WHATSAPP_LEAD_SOURCE,
        notes: "Написал в WhatsApp (+1 424 325-0512).",
        assigned_manager_id: manager.user_id,
        pipeline_status_id: pipelineStatus.pipeline_status_id,
      },
      select: { lead_id: true, name: true, phone: true, assigned_manager_id: true },
    });
    await onLeadCreated(tx, {
      actorUserId: actor.user_id,
      leadId: lead.lead_id,
      managerUserId: manager.user_id,
      leadNameOrTitle: name,
    });
    return { lead, created: true };
  });
}

async function loadHistory(phone: string): Promise<WhatsAppHistoryItem[]> {
  const rows = await prisma.twilioMessage.findMany({
    where: { OR: [{ from_number: phone }, { to_number: phone }] },
    orderBy: { sent_at: "desc" },
    take: 40,
    select: { direction: true, body: true, sent_at: true, raw_payload: true, actor_user_id: true },
  });
  type Row = { direction: string; body: string; sent_at: Date; raw_payload: unknown; actor_user_id: string | null };
  return (rows as Row[])
    .map((row) => {
      const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
      return {
        channel: payload.channel,
        item: {
          direction: row.direction === "in" ? "in" : "out",
          body: row.body,
          sentAt: row.sent_at,
          kind: typeof payload.kind === "string" ? payload.kind : null,
          actorUserId: row.actor_user_id,
        } as WhatsAppHistoryItem,
      };
    })
    .filter((row) => row.channel === "whatsapp")
    .map((row) => row.item);
}

async function generateReply(history: WhatsAppHistoryItem[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!apiKey.startsWith("sk-ant-")) return null;
  const messages = toAnthropicMessages(history);
  if (!messages.length) return null;
  const raw = await requestAnthropicMessage(apiKey, {
    model: resolveAnthropicModel(process.env.ANTHROPIC_DEFAULT_MODEL),
    max_tokens: 600,
    system: buildWhatsAppSystemPrompt(),
    messages,
  });
  return parseWhatsAppBotOutput(raw);
}

/**
 * Every inbound WhatsApp message: make sure the customer is a lead in the CRM,
 * tell the manager, and — unless a person is already handling the chat — let
 * the sales bot answer. Never throws: Twilio already got its 200.
 */
export async function handleInboundWhatsApp(input: InboundWhatsApp) {
  try {
    const phone = normalizeContactPhone(input.from.replace(/^whatsapp:/i, ""));
    if (last10(phone).length < 10 || !input.messageSid) return { status: "ignored" as const };

    const duplicate = await prisma.activityLog.findFirst({
      where: { action_key: INBOUND_ACTION, metadata: { path: ["message_sid"], equals: input.messageSid } },
      select: { activity_id: true },
    });
    if (duplicate) return { status: "duplicate" as const };

    const { lead, created } = await ensureWhatsAppLead(phone, input.profileName);
    const body = input.body.trim() || (input.numMedia ? "[фото/файл]" : "");
    await prisma.activityLog.create({
      data: {
        entity_type: "lead",
        entity_id: lead.lead_id,
        action_key: INBOUND_ACTION,
        message: `WhatsApp: ${body.slice(0, 500)}`,
        metadata: { message_sid: input.messageSid, created_lead: created },
      },
    });

    let managerUserId = lead.assigned_manager_id;
    if (!managerUserId) {
      try {
        managerUserId = (await resolveFacebookMessengerActorAndManager(prisma)).manager.user_id;
      } catch {
        managerUserId = null;
      }
    }
    await notify(
      managerUserId,
      lead.lead_id,
      "lead.whatsapp_message",
      `💬 WhatsApp: ${lead.name}`,
      `«${body.slice(0, 400)}» — ${phone}`,
    );

    if (process.env.WHATSAPP_BOT_ENABLED === "false") return { status: "bot_disabled" as const };
    if (!getTwilioConfig().whatsappReady) return { status: "whatsapp_not_configured" as const };

    const history = await loadHistory(phone);
    if (humanTookOver(history, new Date())) return { status: "human_handling" as const };

    // Several quick messages in a row: answer once, after the latest one.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const latest = await prisma.twilioMessage.findFirst({
      where: { from_number: phone, direction: "in" },
      orderBy: { sent_at: "desc" },
      select: { message_sid: true },
    });
    if (latest && latest.message_sid !== input.messageSid) return { status: "superseded" as const };

    const output = await generateReply(await loadHistory(phone));
    if (!output) return { status: "no_reply" as const };

    const sent = await sendWhatsApp({
      to: phone,
      body: output.reply,
      actorUserId: null,
      rawPayload: { kind: WHATSAPP_BOT_KIND, lead_id: lead.lead_id },
    });
    await prisma.activityLog.create({
      data: {
        entity_type: "lead",
        entity_id: lead.lead_id,
        action_key: REPLY_ACTION,
        message: `Бот ответил в WhatsApp: ${output.reply.slice(0, 500)}`,
        metadata: {
          twilio_sid: sent.sid,
          handoff: output.handoff,
          service_type: output.serviceType,
          city: output.city,
          preferred_time: output.preferredTime,
        },
      },
    });

    if (output.handoff) {
      const facts = [
        output.name && `имя: ${output.name}`,
        output.serviceType && `услуга: ${output.serviceType}`,
        output.city && `адрес/город: ${output.city}`,
        output.preferredTime && `удобное время: ${output.preferredTime}`,
      ].filter(Boolean);
      await notify(
        managerUserId,
        lead.lead_id,
        "lead.whatsapp_handoff",
        `Подключитесь к WhatsApp: ${output.name || lead.name}`,
        `${output.handoffReason || "Клиент готов к замеру"}. ${facts.join(", ")} — ${phone}`,
      );
    }
    return { status: "replied" as const, sid: sent.sid };
  } catch (error) {
    console.error("whatsapp_inbound_failed", error instanceof Error ? error.message : error);
    return { status: "failed" as const };
  }
}
