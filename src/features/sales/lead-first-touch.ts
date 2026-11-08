import { resolveFacebookMessengerActorAndManager } from "@/features/integrations/facebook-messenger-db";
import { getTwilioConfig, sendSms } from "@/features/twilio/service";
import { prisma } from "@/lib/db";

import {
  buildLeadWelcomeSms,
  isLeadBusinessHours,
  LEAD_SMS_REPLY_ACTION,
  LEAD_WELCOME_SMS_ACTION,
  type LeadFirstTouchChannel,
} from "./lead-first-touch-core";

export { buildLeadWelcomeSms, isLeadBusinessHours } from "./lead-first-touch-core";

type FirstTouchInput = {
  leadId: string;
  name: string;
  phone: string | null | undefined;
  channel: LeadFirstTouchChannel;
  managerUserId?: string | null;
  now?: Date;
};

async function resolveManagerUserId(preferred?: string | null) {
  if (preferred) return preferred;
  try {
    const { manager } = await resolveFacebookMessengerActorAndManager(prisma);
    return manager.user_id;
  } catch {
    const owner = await prisma.user.findFirst({
      where: {
        is_active: true,
        user_accesses: { some: { is_active: true, role: { code: "OWNER", is_active: true } } },
      },
      select: { user_id: true },
      orderBy: { created_at: "asc" },
    });
    return owner?.user_id ?? null;
  }
}

async function notify(
  recipientUserId: string | null,
  leadId: string,
  typeKey: string,
  title: string,
  message: string,
) {
  if (!recipientUserId) return;
  await prisma.notification.create({
    data: {
      recipient_user_id: recipientUserId,
      entity_type: "lead",
      entity_id: leadId,
      type_key: typeKey,
      title: title.slice(0, 180),
      message,
    },
  });
}

/**
 * First touch for every new lead with a phone number: a short "thanks for
 * your interest" SMS and an in-CRM notification for the manager. Outside
 * business hours the SMS asks when the manager may call. Never throws — a
 * failed SMS must not lose or roll back the lead.
 */
export async function sendLeadFirstTouch(input: FirstTouchInput) {
  try {
    const now = input.now ?? new Date();
    const managerUserId = await resolveManagerUserId(input.managerUserId);
    const afterHours = !isLeadBusinessHours(now);

    if (input.channel !== "facebook_messenger") {
      await notify(
        managerUserId,
        input.leadId,
        "lead.first_touch",
        afterHours ? "Новый лид (нерабочее время)" : "Новый лид — позвонить сейчас",
        `${input.name}${input.phone ? `, ${input.phone}` : ""}. ${
          afterHours
            ? "Клиенту ушло SMS с вопросом, когда удобно позвонить — ответ придёт уведомлением."
            : "Клиенту ушло SMS «спасибо, менеджер скоро позвонит» — перезвоните в течение 5 минут."
        }`,
      );
    }

    if (process.env.LEAD_WELCOME_SMS_ENABLED === "false") return { status: "disabled" as const };
    if (!input.phone) return { status: "no_phone" as const };
    if (!getTwilioConfig().ready) {
      console.warn("lead_welcome_sms_skipped", { reason: "twilio_not_configured" });
      return { status: "not_configured" as const };
    }

    const already = await prisma.activityLog.findFirst({
      where: { entity_type: "lead", entity_id: input.leadId, action_key: LEAD_WELCOME_SMS_ACTION },
      select: { activity_id: true },
    });
    if (already) return { status: "already_sent" as const };

    const body = buildLeadWelcomeSms({ name: input.name, channel: input.channel, now });
    try {
      const sms = await sendSms({
        to: input.phone,
        body,
        actorUserId: managerUserId,
        rawPayload: { kind: "lead_welcome", lead_id: input.leadId, channel: input.channel, after_hours: afterHours },
      });
      await prisma.activityLog.create({
        data: {
          entity_type: "lead",
          entity_id: input.leadId,
          action_key: LEAD_WELCOME_SMS_ACTION,
          message: afterHours
            ? "Welcome SMS sent after hours with a callback-time question."
            : "Welcome SMS sent.",
          metadata: { status: "sent", twilio_sid: sms.sid, to: sms.to, after_hours: afterHours },
        },
      });
      return { status: "sent" as const, sid: sms.sid };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Twilio SMS failed.";
      await prisma.activityLog.create({
        data: {
          entity_type: "lead",
          entity_id: input.leadId,
          action_key: `${LEAD_WELCOME_SMS_ACTION}_failed`,
          message: "Welcome SMS failed.",
          metadata: { status: "failed", error: message },
        },
      });
      await notify(
        managerUserId,
        input.leadId,
        "lead.welcome_sms_failed",
        "SMS новому лиду не отправилось",
        `${input.name}: ${message}. Позвоните клиенту вручную.`,
      );
      return { status: "failed" as const, error: message };
    }
  } catch (error) {
    console.error("lead_first_touch_failed", error instanceof Error ? error.message : error);
    return { status: "failed" as const };
  }
}

/**
 * A customer replied to the welcome SMS (usually with a time to call). Put the
 * reply in front of the lead's manager immediately.
 */
export async function handleLeadSmsReply(input: { from: string; body: string; messageSid: string }) {
  try {
    const digits = input.from.replace(/\D/g, "").slice(-10);
    if (digits.length < 10 || !input.body.trim()) return;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const candidates = await prisma.lead.findMany({
      where: { phone: { contains: digits.slice(-7) }, created_at: { gte: since } },
      select: { lead_id: true, name: true, phone: true, assigned_manager_id: true },
      orderBy: { created_at: "desc" },
      take: 10,
    });
    const lead = candidates.find((item) => (item.phone || "").replace(/\D/g, "").endsWith(digits));
    if (!lead) return;
    const welcomed = await prisma.activityLog.findFirst({
      where: { entity_type: "lead", entity_id: lead.lead_id, action_key: LEAD_WELCOME_SMS_ACTION },
      select: { activity_id: true },
    });
    if (!welcomed) return;
    const duplicate = await prisma.activityLog.findFirst({
      where: {
        entity_type: "lead",
        entity_id: lead.lead_id,
        action_key: LEAD_SMS_REPLY_ACTION,
        metadata: { path: ["message_sid"], equals: input.messageSid },
      },
      select: { activity_id: true },
    });
    if (duplicate) return;
    const body = input.body.trim().slice(0, 500);
    await prisma.activityLog.create({
      data: {
        entity_type: "lead",
        entity_id: lead.lead_id,
        action_key: LEAD_SMS_REPLY_ACTION,
        message: `Customer replied by SMS: ${body}`,
        metadata: { message_sid: input.messageSid },
      },
    });
    await notify(
      await resolveManagerUserId(lead.assigned_manager_id),
      lead.lead_id,
      "lead.sms_reply",
      `Ответ клиента по SMS: ${lead.name}`,
      `«${body}» — ${lead.phone}. Если это удобное время для звонка, позвоните в это время.`,
    );
  } catch (error) {
    console.error("lead_sms_reply_failed", error instanceof Error ? error.message : error);
  }
}

/** The Messenger bot reports the customer's preferred callback time. */
export async function notifyLeadCallbackRequest(input: {
  leadId: string;
  name: string;
  phone: string;
  callbackTime: string;
  managerUserId: string | null;
}) {
  try {
    await notify(
      input.managerUserId,
      input.leadId,
      "lead.callback_requested",
      `Перезвонить: ${input.name}`,
      `Клиент из Messenger просит позвонить: «${input.callbackTime.slice(0, 200)}» — ${input.phone}.`,
    );
  } catch (error) {
    console.error("lead_callback_notify_failed", error instanceof Error ? error.message : error);
  }
}
