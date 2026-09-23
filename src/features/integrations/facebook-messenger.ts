import { Prisma } from "@prisma/client";

import { onConsultationScheduled } from "@/features/core/events";
import { sendSms } from "@/features/twilio/service";
import { prisma } from "@/lib/db";

import {
  buildAvailableSlots,
  buildFacebookMessengerLeadNotes,
  FACEBOOK_MESSENGER_BOOKING_ACTION,
  FACEBOOK_MESSENGER_LEAD_ACTION,
  FACEBOOK_MESSENGER_PROVIDER,
  FacebookMessengerIntegrationError,
  facebookMessengerContactLockKeys,
  facebookMessengerEventKey,
  facebookMessengerPayloadHash,
  formatFacebookMessengerBookingSms,
  INACTIVE_CALENDAR_STATUSES,
  parseFacebookMessengerBookingPayload,
  parseFacebookMessengerLeadPayload,
  parseFacebookMessengerSlotPayload,
} from "./facebook-messenger-core";
import {
  acquireFacebookMessengerLock,
  createOrReuseFacebookMessengerLead,
  findFacebookMessengerReceipt,
  facebookMessengerReceiptPayloadHash,
  facebookMessengerReceiptResult,
  recordFacebookMessengerReceipt,
  resolveFacebookMessengerActorAndManager,
  resolveFacebookMessengerConsultant,
  type FacebookMessengerDbClient,
} from "./facebook-messenger-db";

export {
  buildAvailableSlots,
  createFacebookMessengerSignature,
  FacebookMessengerIntegrationError,
  getFacebookMessengerSharedSecret,
  normalizeContactPhone,
  verifyFacebookMessengerSignature,
} from "./facebook-messenger-core";

export type FacebookMessengerLeadResult = {
  lead_id: string;
  created: boolean;
  source: string | null;
  idempotent_replay: boolean;
};

export type FacebookMessengerBookingSmsResult = {
  status: "sent" | "already_sent" | "failed";
  sid?: string;
  to?: string;
  error?: string;
};

type FacebookMessengerBookingCoreResult = {
  lead_id: string;
  consultation_id: string;
  calendar_event_id: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  consultant: { user_id: string; full_name: string };
  reused_lead: boolean;
  reused_booking: boolean;
  idempotent_replay: boolean;
};

export type FacebookMessengerBookingResult = FacebookMessengerBookingCoreResult & {
  sms_confirmation: FacebookMessengerBookingSmsResult;
};

const FACEBOOK_MESSENGER_BOOKING_SMS_ACTION = "integration.facebook_messenger.booking_sms";

async function ensureFacebookMessengerBookingSms(input: {
  booking: FacebookMessengerBookingCoreResult;
  phone: string;
  actorUserId: string;
  managerUserId: string;
}) {
  return prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    await acquireFacebookMessengerLock(
      tx,
      "rolanpro-facebook-booking-sms",
      input.booking.consultation_id,
    );

    const existing = await tx.activityLog.findFirst({
      where: {
        entity_type: "consultation",
        entity_id: input.booking.consultation_id,
        action_key: FACEBOOK_MESSENGER_BOOKING_SMS_ACTION,
      },
      orderBy: { created_at: "desc" },
      select: { metadata: true },
    });

    if (existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)) {
      const metadata = existing.metadata as Record<string, unknown>;
      if (metadata.status === "sent" && typeof metadata.twilio_sid === "string") {
        return {
          status: "already_sent" as const,
          sid: metadata.twilio_sid,
          to: typeof metadata.to === "string" ? metadata.to : undefined,
        };
      }
    }

    try {
      const sms = await sendSms({
        to: input.phone,
        body: formatFacebookMessengerBookingSms(input.booking.scheduled_start_at),
        actorUserId: input.actorUserId,
        rawPayload: {
          source: FACEBOOK_MESSENGER_PROVIDER,
          kind: "booking_confirmation",
          consultation_id: input.booking.consultation_id,
          lead_id: input.booking.lead_id,
        },
      });

      await tx.activityLog.create({
        data: {
          actor_user_id: input.actorUserId,
          entity_type: "consultation",
          entity_id: input.booking.consultation_id,
          action_key: FACEBOOK_MESSENGER_BOOKING_SMS_ACTION,
          message: "Facebook Messenger booking confirmation SMS sent.",
          metadata: {
            status: "sent",
            twilio_sid: sms.sid,
            twilio_status: sms.status,
            to: sms.to,
          },
        },
      });

      return { status: "sent" as const, sid: sms.sid, to: sms.to };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Twilio SMS failed.";

      await tx.activityLog.create({
        data: {
          actor_user_id: input.actorUserId,
          entity_type: "consultation",
          entity_id: input.booking.consultation_id,
          action_key: FACEBOOK_MESSENGER_BOOKING_SMS_ACTION,
          message: "Facebook Messenger booking confirmation SMS failed.",
          metadata: { status: "failed", error: message },
        },
      });

      const priorNotification = await tx.notification.findFirst({
        where: {
          recipient_user_id: input.managerUserId,
          entity_type: "consultation",
          entity_id: input.booking.consultation_id,
          type_key: "facebook_messenger.sms_failed",
          is_read: false,
        },
        select: { notification_id: true },
      });

      if (!priorNotification) {
        await tx.notification.create({
          data: {
            recipient_user_id: input.managerUserId,
            actor_user_id: input.actorUserId,
            entity_type: "consultation",
            entity_id: input.booking.consultation_id,
            type_key: "facebook_messenger.sms_failed",
            title: "SMS клиенту не отправлено",
            message: `Запись из Facebook сохранена, но подтверждение SMS не отправилось: ${message}`,
          },
        });
      }

      return { status: "failed" as const, error: message };
    }
  });
}

export async function captureFacebookMessengerLead(
  value: unknown,
): Promise<FacebookMessengerLeadResult> {
  const payload = parseFacebookMessengerLeadPayload(value);
  const eventKey = facebookMessengerEventKey("lead", payload);
  const payloadHash = facebookMessengerPayloadHash(payload);

  return prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    await acquireFacebookMessengerLock(tx, "rolanpro-facebook-event", eventKey);
    const receipt = await findFacebookMessengerReceipt(
      tx,
      FACEBOOK_MESSENGER_LEAD_ACTION,
      eventKey,
    );
    if (receipt) {
      if (facebookMessengerReceiptPayloadHash(receipt) !== payloadHash) {
        throw new FacebookMessengerIntegrationError(
          409,
          "idempotency_conflict",
          "This external_event_id was already used with a different payload.",
        );
      }
      const result = facebookMessengerReceiptResult<FacebookMessengerLeadResult>(receipt);
      if (result) return { ...result, idempotent_replay: true };
    }

    for (const contactKey of facebookMessengerContactLockKeys(payload)) {
      await acquireFacebookMessengerLock(tx, "rolanpro-facebook-contact", contactKey);
    }
    const { actor, manager } = await resolveFacebookMessengerActorAndManager(tx);
    const { lead, created } = await createOrReuseFacebookMessengerLead(
      tx,
      payload,
      actor,
      manager,
    );
    const result: FacebookMessengerLeadResult = {
      lead_id: lead.lead_id,
      created,
      source: lead.source,
      idempotent_replay: false,
    };

    await recordFacebookMessengerReceipt(tx, {
      actionKey: FACEBOOK_MESSENGER_LEAD_ACTION,
      eventKey,
      payloadHash,
      actorUserId: actor.user_id,
      entityType: "lead",
      entityId: lead.lead_id,
      message: `Facebook Messenger lead captured for ${payload.name}.`,
      externalEventId: payload.external_event_id,
      externalContactId: payload.external_contact_id,
      pageId: payload.page_id,
      result: result as Prisma.InputJsonValue,
    });
    return result;
  });
}

export async function listFacebookMessengerSlots(value: unknown) {
  const input = parseFacebookMessengerSlotPayload(value);

  return prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    const consultant = await resolveFacebookMessengerConsultant(tx);
    const earliest = new Date(
      Math.min(...input.windows.map((window) => window.startAt.getTime())),
    );
    const latest = new Date(
      Math.max(...input.windows.map((window) => window.endAt.getTime())),
    );
    const events = await tx.calendarEvent.findMany({
      where: {
        assigned_user_id: consultant.user_id,
        status: { notIn: INACTIVE_CALENDAR_STATUSES },
        starts_at: { lt: latest },
        ends_at: { gt: earliest },
      },
      select: { starts_at: true, ends_at: true },
    });

    return {
      consultant: { user_id: consultant.user_id, full_name: consultant.full_name },
      slots: buildAvailableSlots({
        windows: input.windows,
        busyRanges: events.map((event: { starts_at: Date; ends_at: Date }) => ({
          startAt: event.starts_at,
          endAt: event.ends_at,
        })),
        durationMinutes: input.durationMinutes,
        stepMinutes: input.stepMinutes,
        limit: input.limit,
      }),
    };
  });
}

export async function bookFacebookMessengerConsultation(
  value: unknown,
): Promise<FacebookMessengerBookingResult> {
  const payload = parseFacebookMessengerBookingPayload(value);
  const eventKey = facebookMessengerEventKey("booking", payload);
  const payloadHash = facebookMessengerPayloadHash(payload);
  const startsAt = new Date(payload.scheduled_start_at);
  const endsAt = new Date(payload.scheduled_end_at);

  const booking = await prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    await acquireFacebookMessengerLock(tx, "rolanpro-facebook-event", eventKey);
    const receipt = await findFacebookMessengerReceipt(
      tx,
      FACEBOOK_MESSENGER_BOOKING_ACTION,
      eventKey,
    );
    if (receipt) {
      if (facebookMessengerReceiptPayloadHash(receipt) !== payloadHash) {
        throw new FacebookMessengerIntegrationError(
          409,
          "idempotency_conflict",
          "This external_event_id was already used with a different payload.",
        );
      }
      const result = facebookMessengerReceiptResult<FacebookMessengerBookingCoreResult>(receipt);
      if (result) return { ...result, idempotent_replay: true };
    }

    for (const contactKey of facebookMessengerContactLockKeys(payload)) {
      await acquireFacebookMessengerLock(tx, "rolanpro-facebook-contact", contactKey);
    }
    if (startsAt.getTime() < Date.now() - 60 * 1000) {
      throw new FacebookMessengerIntegrationError(
        400,
        "invalid_payload",
        "scheduled_start_at must be in the future.",
      );
    }

    const { actor, manager } = await resolveFacebookMessengerActorAndManager(tx);
    const consultant = await resolveFacebookMessengerConsultant(tx);
    const { lead, created } = await createOrReuseFacebookMessengerLead(
      tx,
      payload,
      actor,
      manager,
    );

    await acquireFacebookMessengerLock(
      tx,
      "rolanpro-consultant-calendar",
      consultant.user_id,
    );
    const existingBooking = await tx.consultation.findFirst({
      where: {
        lead_id: lead.lead_id,
        assigned_consultant_id: consultant.user_id,
        scheduled_start_at: startsAt,
        scheduled_end_at: endsAt,
        status: { notIn: INACTIVE_CALENDAR_STATUSES },
      },
      select: {
        consultation_id: true,
        calendar_event_id: true,
        scheduled_start_at: true,
        scheduled_end_at: true,
      },
    });

    if (existingBooking) {
      const result: FacebookMessengerBookingCoreResult = {
        lead_id: lead.lead_id,
        consultation_id: existingBooking.consultation_id,
        calendar_event_id: existingBooking.calendar_event_id,
        scheduled_start_at: existingBooking.scheduled_start_at.toISOString(),
        scheduled_end_at: existingBooking.scheduled_end_at.toISOString(),
        consultant: { user_id: consultant.user_id, full_name: consultant.full_name },
        reused_lead: !created,
        reused_booking: true,
        idempotent_replay: false,
      };
      await recordFacebookMessengerReceipt(tx, {
        actionKey: FACEBOOK_MESSENGER_BOOKING_ACTION,
        eventKey,
        payloadHash,
        actorUserId: actor.user_id,
        entityType: "consultation",
        entityId: existingBooking.consultation_id,
        message: `Facebook Messenger reused an existing consultation for ${payload.name}.`,
        externalEventId: payload.external_event_id,
        externalContactId: payload.external_contact_id,
        pageId: payload.page_id,
        result: result as Prisma.InputJsonValue,
      });
      return result;
    }

    const conflict = await tx.calendarEvent.findFirst({
      where: {
        assigned_user_id: consultant.user_id,
        status: { notIn: INACTIVE_CALENDAR_STATUSES },
        starts_at: { lt: endsAt },
        ends_at: { gt: startsAt },
      },
      select: { calendar_event_id: true },
    });
    if (conflict) {
      throw new FacebookMessengerIntegrationError(
        409,
        "slot_unavailable",
        "The selected consultation time is no longer available.",
      );
    }

    const [eventType, eventTrack] = await Promise.all([
      tx.eventType.findUnique({
        where: { event_code: "CONSULTATION" },
        select: { event_type_id: true },
      }),
      tx.eventTrack.findUnique({
        where: { track_code: "SURVEY" },
        select: { event_track_id: true },
      }),
    ]);
    if (!eventType) {
      throw new FacebookMessengerIntegrationError(
        500,
        "missing_event_type",
        "CONSULTATION event type is not configured.",
      );
    }

    const title = payload.title || `${payload.name} · Facebook Messenger consultation`;
    const event = await tx.calendarEvent.create({
      data: {
        event_type_id: eventType.event_type_id,
        event_track_id: eventTrack?.event_track_id ?? null,
        lead_id: lead.lead_id,
        assigned_user_id: consultant.user_id,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "scheduled",
        color_token: "yellow",
        metadata: {
          context: "consultation",
          source: FACEBOOK_MESSENGER_PROVIDER,
          external_event_id: payload.external_event_id,
          page_id: payload.page_id,
        },
      },
    });
    const consultation = await tx.consultation.create({
      data: {
        calendar_event_id: event.calendar_event_id,
        lead_id: lead.lead_id,
        assigned_consultant_id: consultant.user_id,
        assigned_manager_id: manager.user_id,
        created_by: actor.user_id,
        title,
        location_address: payload.address || payload.city || null,
        scheduled_start_at: startsAt,
        scheduled_end_at: endsAt,
        manager_notes: buildFacebookMessengerLeadNotes(payload),
        status: "scheduled",
      },
    });
    await tx.survey.create({
      data: { consultation_id: consultation.consultation_id, status: "draft" },
    });
    await onConsultationScheduled(tx, {
      actorUserId: actor.user_id,
      consultationId: consultation.consultation_id,
      consultationTitle: consultation.title,
      leadId: lead.lead_id,
      consultantUserId: consultant.user_id,
      scheduledStartAt: startsAt,
    });

    if (manager.user_id !== consultant.user_id) {
      await tx.notification.create({
        data: {
          recipient_user_id: manager.user_id,
          actor_user_id: actor.user_id,
          entity_type: "consultation",
          entity_id: consultation.consultation_id,
          type_key: "facebook_messenger.booking",
          title: "Новая запись из Facebook",
          message: `${payload.name} записан на консультацию ${startsAt.toLocaleString("ru-RU")}.`,
        },
      });
    }

    const result: FacebookMessengerBookingCoreResult = {
      lead_id: lead.lead_id,
      consultation_id: consultation.consultation_id,
      calendar_event_id: event.calendar_event_id,
      scheduled_start_at: startsAt.toISOString(),
      scheduled_end_at: endsAt.toISOString(),
      consultant: { user_id: consultant.user_id, full_name: consultant.full_name },
      reused_lead: !created,
      reused_booking: false,
      idempotent_replay: false,
    };
    await recordFacebookMessengerReceipt(tx, {
      actionKey: FACEBOOK_MESSENGER_BOOKING_ACTION,
      eventKey,
      payloadHash,
      actorUserId: actor.user_id,
      entityType: "consultation",
      entityId: consultation.consultation_id,
      message: `Facebook Messenger booked consultation ${title}.`,
      externalEventId: payload.external_event_id,
      externalContactId: payload.external_contact_id,
      pageId: payload.page_id,
      result: result as Prisma.InputJsonValue,
    });
    return result;
  });

  const { actor, manager } = await prisma.$transaction(
    async (tx: FacebookMessengerDbClient) => resolveFacebookMessengerActorAndManager(tx),
  );
  const smsConfirmation = await ensureFacebookMessengerBookingSms({
    booking,
    phone: payload.phone,
    actorUserId: actor.user_id,
    managerUserId: manager.user_id,
  });

  return {
    ...booking,
    sms_confirmation: smsConfirmation,
  };
}
