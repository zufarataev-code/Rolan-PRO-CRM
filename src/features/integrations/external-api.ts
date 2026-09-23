import { Prisma } from "@prisma/client";

import { onConsultationScheduled, onLeadCreated } from "@/features/core/events";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

import {
  buildAvailableSlots,
  ExternalApiError,
  externalContactIdentity,
  externalEventKey,
  externalPayloadHash,
  INACTIVE_CALENDAR_STATUSES,
  parseExternalBookingPayload,
  parseExternalLeadPayload,
  parseExternalSlotPayload,
  type ExternalBookingPayload,
  type ExternalLeadPayload,
} from "./external-api-core";

const EXTERNAL_API_LEAD_ACTION = "integration.external_api.lead";
const EXTERNAL_API_BOOKING_ACTION = "integration.external_api.booking";
const OPEN_LEAD_STATUS_CODES = ["NEW_LEAD", "LEAD", "CONSULTATION_SCHEDULED"];

type DbClient = Prisma.TransactionClient;
type IntegrationAccess = {
  role: { code: string; is_active: boolean };
};

type ExternalIntegrationUser = {
  user_id: string;
  full_name: string;
  email: string;
};

type ReusableLead = {
  lead_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  assigned_manager_id: string | null;
};

const USER_SELECT = {
  user_id: true,
  full_name: true,
  email: true,
  is_active: true,
  user_accesses: {
    where: { is_active: true },
    select: {
      role: {
        select: { code: true, is_active: true },
      },
    },
  },
} satisfies Prisma.UserSelect;

const REUSABLE_LEAD_SELECT = {
  lead_id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  notes: true,
  assigned_manager_id: true,
} as const;

function configuredUserReference(
  prefix: "ACTOR" | "DEFAULT_MANAGER" | "DEFAULT_CONSULTANT",
  required: boolean,
) {
  const userId = process.env[`ROLANPRO_EXTERNAL_API_${prefix}_USER_ID`]?.trim();
  const email = process.env[`ROLANPRO_EXTERNAL_API_${prefix}_EMAIL`]?.trim().toLowerCase();

  if (!userId && !email && required) {
    throw new ExternalApiError(
      503,
      "external_api_not_configured",
      `ROLANPRO_EXTERNAL_API_${prefix}_USER_ID or ROLANPRO_EXTERNAL_API_${prefix}_EMAIL is required.`,
    );
  }

  return userId || email ? { userId, email } : null;
}

async function resolveConfiguredUser(
  tx: DbClient,
  reference: { userId?: string; email?: string },
  acceptedRoles: string[],
  label: string,
): Promise<ExternalIntegrationUser> {
  const user = reference.userId
    ? await tx.user.findUnique({ where: { user_id: reference.userId }, select: USER_SELECT })
    : await tx.user.findUnique({ where: { email: reference.email! }, select: USER_SELECT });

  const roles =
    user?.user_accesses
      .filter((access: IntegrationAccess) => access.role.is_active)
      .map((access: IntegrationAccess) => access.role.code) ?? [];

  if (!user?.is_active || !acceptedRoles.some((role) => roles.includes(role))) {
    throw new ExternalApiError(
      503,
      "external_api_not_configured",
      `${label} must be an active CRM user with one of these roles: ${acceptedRoles.join(", ")}.`,
    );
  }

  return { user_id: user.user_id, full_name: user.full_name, email: user.email };
}

async function resolveActorAndManager(tx: DbClient) {
  const actor = await resolveConfiguredUser(
    tx,
    configuredUserReference("ACTOR", true)!,
    [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
    "External API actor",
  );
  const managerReference = configuredUserReference("DEFAULT_MANAGER", false);
  const manager = managerReference
    ? await resolveConfiguredUser(
        tx,
        managerReference,
        [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
        "External API default manager",
      )
    : actor;

  return { actor, manager };
}

async function resolveConsultant(tx: DbClient) {
  return resolveConfiguredUser(
    tx,
    configuredUserReference("DEFAULT_CONSULTANT", true)!,
    [ROLE_CODES.CONSULTANT],
    "External API default consultant",
  );
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return value.trim();
}

function buildLeadNotes(payload: ExternalLeadPayload) {
  const identity = externalContactIdentity(payload);
  return [
    "External API lead",
    `Source: ${payload.source}`,
    `External event: ${payload.external_id}`,
    identity ? `External identity: ${identity}` : null,
    payload.service_type ? `Service: ${payload.service_type}` : null,
    payload.property_type ? `Property: ${payload.property_type}` : null,
    payload.city ? `City / Area: ${payload.city}` : null,
    payload.address ? `Address: ${payload.address}` : null,
    payload.message ? `Message: ${payload.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function appendNotes(existing: string | null, addition: string) {
  if (!existing?.trim()) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing.trim()}\n\n${addition}`;
}

async function acquireLock(tx: DbClient, namespace: string, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
}

type ReceiptRow = { metadata: unknown };

async function findReceipt(tx: DbClient, actionKey: string, eventKey: string) {
  const rows = await tx.$queryRaw<ReceiptRow[]>`
    SELECT metadata
    FROM activity_log
    WHERE action_key = ${actionKey}
      AND metadata ->> 'event_key' = ${eventKey}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.metadata ?? null;
}

function receiptPayloadHash(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof (metadata as Record<string, unknown>).payload_hash === "string"
    ? ((metadata as Record<string, unknown>).payload_hash as string)
    : null;
}

function receiptResult<T>(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const result = (metadata as Record<string, unknown>).result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as T)
    : null;
}

async function recordReceipt(
  tx: DbClient,
  input: {
    actionKey: string;
    eventKey: string;
    payloadHash: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    message: string;
    provider: string;
    externalId: string;
    result: Prisma.InputJsonValue;
  },
) {
  await tx.activityLog.create({
    data: {
      actor_user_id: input.actorUserId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action_key: input.actionKey,
      message: input.message,
      metadata: {
        provider: input.provider,
        event_key: input.eventKey,
        external_id: input.externalId,
        payload_hash: input.payloadHash,
        result: input.result,
      },
    },
  });
}

async function findReusableLead(tx: DbClient, payload: ExternalLeadPayload) {
  const baseWhere: Prisma.LeadWhereInput = {
    pipeline_status: { status_code: { in: OPEN_LEAD_STATUS_CODES } },
  };
  const identity = externalContactIdentity(payload);

  if (identity) {
    const byIdentity = await tx.lead.findFirst({
      where: { ...baseWhere, notes: { contains: `External identity: ${identity}` } },
      orderBy: { updated_at: "desc" },
      select: REUSABLE_LEAD_SELECT,
    });
    if (byIdentity) return byIdentity;
  }

  if (payload.email) {
    const byEmail = await tx.lead.findFirst({
      where: { ...baseWhere, email: payload.email },
      orderBy: { updated_at: "desc" },
      select: REUSABLE_LEAD_SELECT,
    });
    if (byEmail) return byEmail;
  }

  const normalizedPhone = normalizePhone(payload.phone);
  const phoneCandidates = await tx.lead.findMany({
    where: { ...baseWhere, phone: { not: null } },
    orderBy: { updated_at: "desc" },
    select: REUSABLE_LEAD_SELECT,
  });

  return (
    phoneCandidates.find(
      (lead: ReusableLead) => lead.phone && normalizePhone(lead.phone) === normalizedPhone,
    ) ?? null
  );
}

async function createOrReuseLead(
  tx: DbClient,
  payload: ExternalLeadPayload,
  actor: ExternalIntegrationUser,
  manager: ExternalIntegrationUser,
) {
  const notes = buildLeadNotes(payload);
  const existing = await findReusableLead(tx, payload);

  if (existing) {
    const lead = await tx.lead.update({
      where: { lead_id: existing.lead_id },
      data: {
        phone: existing.phone || normalizePhone(payload.phone),
        email: existing.email || payload.email || null,
        assigned_manager_id: existing.assigned_manager_id || manager.user_id,
        notes: appendNotes(existing.notes, notes),
      },
      select: { lead_id: true, name: true, source: true },
    });
    return { lead, created: false };
  }

  const pipelineStatus =
    (await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" } })) ??
    (await tx.pipelineStatus.findUnique({ where: { status_code: "LEAD" } }));

  if (!pipelineStatus) {
    throw new ExternalApiError(
      500,
      "missing_pipeline_status",
      "Pipeline status for new leads is not configured.",
    );
  }

  const lead = await tx.lead.create({
    data: {
      name: payload.name,
      phone: normalizePhone(payload.phone),
      email: payload.email || null,
      source: payload.source,
      notes,
      assigned_manager_id: manager.user_id,
      pipeline_status_id: pipelineStatus.pipeline_status_id,
    },
    select: { lead_id: true, name: true, source: true },
  });

  await onLeadCreated(tx, {
    actorUserId: actor.user_id,
    leadId: lead.lead_id,
    managerUserId: manager.user_id,
    leadNameOrTitle: lead.name,
  });

  return { lead, created: true };
}

export type ExternalLeadResult = {
  lead_id: string;
  created: boolean;
  source: string | null;
  idempotent_replay: boolean;
};

export type ExternalBookingResult = {
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

export async function captureExternalLead(value: unknown): Promise<ExternalLeadResult> {
  const payload = parseExternalLeadPayload(value);
  const eventKey = externalEventKey("lead", payload);
  const payloadHash = externalPayloadHash(payload);

  return prisma.$transaction(async (tx) => {
    await acquireLock(tx, "rolanpro-external-event", eventKey);

    const receipt = await findReceipt(tx, EXTERNAL_API_LEAD_ACTION, eventKey);
    if (receipt) {
      if (receiptPayloadHash(receipt) !== payloadHash) {
        throw new ExternalApiError(
          409,
          "idempotency_conflict",
          "This source/external_id pair was already used with a different payload.",
        );
      }

      const previous = receiptResult<ExternalLeadResult>(receipt);
      if (previous) return { ...previous, idempotent_replay: true };
    }

    const contactIdentity = externalContactIdentity(payload);
    if (contactIdentity) {
      await acquireLock(tx, "rolanpro-external-contact", contactIdentity);
    }

    const { actor, manager } = await resolveActorAndManager(tx);
    const { lead, created } = await createOrReuseLead(tx, payload, actor, manager);

    const result: ExternalLeadResult = {
      lead_id: lead.lead_id,
      created,
      source: lead.source,
      idempotent_replay: false,
    };

    await recordReceipt(tx, {
      actionKey: EXTERNAL_API_LEAD_ACTION,
      eventKey,
      payloadHash,
      actorUserId: actor.user_id,
      entityType: "lead",
      entityId: lead.lead_id,
      message: `External API captured lead ${lead.name} from ${payload.source}.`,
      provider: payload.source,
      externalId: payload.external_id,
      result: result as Prisma.InputJsonValue,
    });

    return result;
  });
}

export async function listExternalConsultationSlots(value: unknown) {
  const input = parseExternalSlotPayload(value);

  return prisma.$transaction(async (tx) => {
    const consultant = await resolveConsultant(tx);
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
        busyRanges: events.map((event) => ({
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

export async function bookExternalConsultation(
  value: unknown,
): Promise<ExternalBookingResult> {
  const payload = parseExternalBookingPayload(value);
  const eventKey = externalEventKey("booking", payload);
  const payloadHash = externalPayloadHash(payload);
  const startsAt = new Date(payload.scheduled_start_at);
  const endsAt = new Date(payload.scheduled_end_at);

  return prisma.$transaction(async (tx) => {
    await acquireLock(tx, "rolanpro-external-event", eventKey);

    const receipt = await findReceipt(tx, EXTERNAL_API_BOOKING_ACTION, eventKey);
    if (receipt) {
      if (receiptPayloadHash(receipt) !== payloadHash) {
        throw new ExternalApiError(
          409,
          "idempotency_conflict",
          "This source/external_id pair was already used with a different booking payload.",
        );
      }

      const previous = receiptResult<ExternalBookingResult>(receipt);
      if (previous) return { ...previous, idempotent_replay: true };
    }

    if (startsAt.getTime() < Date.now() - 60 * 1000) {
      throw new ExternalApiError(
        400,
        "invalid_payload",
        "scheduled_start_at must be in the future.",
      );
    }

    const contactIdentity = externalContactIdentity(payload);
    if (contactIdentity) {
      await acquireLock(tx, "rolanpro-external-contact", contactIdentity);
    }

    const { actor, manager } = await resolveActorAndManager(tx);
    const consultant = await resolveConsultant(tx);
    const { lead, created } = await createOrReuseLead(tx, payload, actor, manager);

    await acquireLock(tx, "rolanpro-consultant-calendar", consultant.user_id);

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
      const result: ExternalBookingResult = {
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

      await recordReceipt(tx, {
        actionKey: EXTERNAL_API_BOOKING_ACTION,
        eventKey,
        payloadHash,
        actorUserId: actor.user_id,
        entityType: "consultation",
        entityId: existingBooking.consultation_id,
        message: `External API reused consultation for ${payload.name} from ${payload.source}.`,
        provider: payload.source,
        externalId: payload.external_id,
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
      throw new ExternalApiError(
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
      throw new ExternalApiError(
        500,
        "missing_event_type",
        "CONSULTATION event type is not configured.",
      );
    }

    const title = payload.title || `${payload.name} · consultation`;
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
          source: payload.source,
          external_id: payload.external_id,
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
        manager_notes: buildLeadNotes(payload),
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

    const result: ExternalBookingResult = {
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

    await recordReceipt(tx, {
      actionKey: EXTERNAL_API_BOOKING_ACTION,
      eventKey,
      payloadHash,
      actorUserId: actor.user_id,
      entityType: "consultation",
      entityId: consultation.consultation_id,
      message: `External API booked consultation ${title} from ${payload.source}.`,
      provider: payload.source,
      externalId: payload.external_id,
      result: result as Prisma.InputJsonValue,
    });

    return result;
  });
}
