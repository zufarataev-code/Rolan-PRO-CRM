import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { onLeadCreated } from "@/features/core/events";
import { ROLE_CODES } from "@/lib/auth/constants";

import {
  appendLeadNotes,
  buildFacebookMessengerLeadNotes,
  FACEBOOK_MESSENGER_PROVIDER,
  FacebookMessengerIntegrationError,
  facebookMessengerIdentityHash,
  normalizeContactPhone,
  OPEN_LEAD_STATUS_CODES,
  type FacebookMessengerLeadPayload,
} from "./facebook-messenger-core";

export type FacebookMessengerDbClient = Prisma.TransactionClient;

export type FacebookMessengerIntegrationUser = {
  user_id: string;
  full_name: string;
  email: string;
  roles: string[];
};

type IntegrationAccess = {
  role: { code: string; is_active: boolean };
};

type ReusableLead = {
  lead_id: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  assigned_manager_id: string | null;
};

const INTEGRATION_USER_SELECT = {
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

function configuredUserReference(
  prefix: "ACTOR" | "DEFAULT_MANAGER" | "DEFAULT_CONSULTANT",
  required: boolean,
) {
  const userId = process.env[`FACEBOOK_MESSENGER_${prefix}_USER_ID`]?.trim();
  const email = process.env[`FACEBOOK_MESSENGER_${prefix}_EMAIL`]?.trim().toLowerCase();
  if (!userId && !email && required) {
    throw new FacebookMessengerIntegrationError(
      503,
      "integration_not_configured",
      `FACEBOOK_MESSENGER_${prefix}_USER_ID or FACEBOOK_MESSENGER_${prefix}_EMAIL is required.`,
    );
  }
  return userId || email ? { userId, email } : null;
}

async function resolveConfiguredUser(
  tx: FacebookMessengerDbClient,
  reference: { userId?: string; email?: string },
  acceptedRoles: string[],
  label: string,
): Promise<FacebookMessengerIntegrationUser> {
  const user = reference.userId
    ? await tx.user.findUnique({ where: { user_id: reference.userId }, select: INTEGRATION_USER_SELECT })
    : await tx.user.findUnique({ where: { email: reference.email! }, select: INTEGRATION_USER_SELECT });

  const roles =
    user?.user_accesses
      .filter((access: IntegrationAccess) => access.role.is_active)
      .map((access: IntegrationAccess) => access.role.code) ?? [];

  if (!user?.is_active || !acceptedRoles.some((role) => roles.includes(role))) {
    throw new FacebookMessengerIntegrationError(
      503,
      "integration_not_configured",
      `${label} must be an active CRM user with one of these roles: ${acceptedRoles.join(", ")}.`,
    );
  }

  return { user_id: user.user_id, full_name: user.full_name, email: user.email, roles };
}

export async function resolveFacebookMessengerActorAndManager(tx: FacebookMessengerDbClient) {
  const actor = await resolveConfiguredUser(
    tx,
    configuredUserReference("ACTOR", true)!,
    [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
    "Actor",
  );
  const managerReference = configuredUserReference("DEFAULT_MANAGER", false);
  const manager = managerReference
    ? await resolveConfiguredUser(
        tx,
        managerReference,
        [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
        "Default manager",
      )
    : actor;
  return { actor, manager };
}

export async function resolveFacebookMessengerConsultant(tx: FacebookMessengerDbClient) {
  return resolveConfiguredUser(
    tx,
    configuredUserReference("DEFAULT_CONSULTANT", true)!,
    [ROLE_CODES.CONSULTANT],
    "Default consultant",
  );
}

export async function acquireFacebookMessengerLock(
  tx: FacebookMessengerDbClient,
  namespace: string,
  key: string,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
}

type ReceiptRow = { metadata: unknown };

export async function findFacebookMessengerReceipt(
  tx: FacebookMessengerDbClient,
  actionKey: string,
  eventKey: string,
) {
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

export function facebookMessengerReceiptPayloadHash(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof (metadata as Record<string, unknown>).payload_hash === "string"
    ? ((metadata as Record<string, unknown>).payload_hash as string)
    : null;
}

export function facebookMessengerReceiptResult<T>(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const result = (metadata as Record<string, unknown>).result;
  return result && typeof result === "object" && !Array.isArray(result) ? (result as T) : null;
}

export async function recordFacebookMessengerReceipt(
  tx: FacebookMessengerDbClient,
  input: {
    actionKey: string;
    eventKey: string;
    payloadHash: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    message: string;
    externalEventId: string;
    externalContactId: string;
    pageId: string;
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
        provider: FACEBOOK_MESSENGER_PROVIDER,
        event_key: input.eventKey,
        payload_hash: input.payloadHash,
        external_event_id: input.externalEventId,
        external_contact_hash: createHash("sha256")
          .update(`${input.pageId}:${input.externalContactId}`)
          .digest("hex"),
        page_id: input.pageId,
        result: input.result,
      },
    },
  });
}

const REUSABLE_LEAD_SELECT = {
  lead_id: true,
  phone: true,
  email: true,
  source: true,
  notes: true,
  assigned_manager_id: true,
} as const;

async function reusableLead(tx: FacebookMessengerDbClient, payload: FacebookMessengerLeadPayload) {
  const baseWhere: Prisma.LeadWhereInput = {
    pipeline_status: { status_code: { in: OPEN_LEAD_STATUS_CODES } },
  };
  const identityMarker = `Messenger identity: ${facebookMessengerIdentityHash(payload)}`;

  const byIdentity = await tx.lead.findFirst({
    where: { ...baseWhere, notes: { contains: identityMarker } },
    orderBy: { updated_at: "desc" },
    select: REUSABLE_LEAD_SELECT,
  });
  if (byIdentity) return byIdentity;

  if (payload.email) {
    const byEmail = await tx.lead.findFirst({
      where: { ...baseWhere, email: payload.email.toLowerCase() },
      orderBy: { updated_at: "desc" },
      select: REUSABLE_LEAD_SELECT,
    });
    if (byEmail) return byEmail;
  }

  const normalizedPhone = normalizeContactPhone(payload.phone);
  const phoneCandidates = await tx.lead.findMany({
    where: { ...baseWhere, phone: { not: null } },
    orderBy: { updated_at: "desc" },
    select: REUSABLE_LEAD_SELECT,
  });
  return phoneCandidates.find(
    (lead: ReusableLead) => lead.phone && normalizeContactPhone(lead.phone) === normalizedPhone,
  ) ?? null;
}

export async function createOrReuseFacebookMessengerLead(
  tx: FacebookMessengerDbClient,
  payload: FacebookMessengerLeadPayload,
  actor: FacebookMessengerIntegrationUser,
  manager: FacebookMessengerIntegrationUser,
) {
  const notes = buildFacebookMessengerLeadNotes(payload);
  const existing = await reusableLead(tx, payload);

  if (existing) {
    const lead = await tx.lead.update({
      where: { lead_id: existing.lead_id },
      data: {
        phone: existing.phone || normalizeContactPhone(payload.phone),
        email: existing.email || payload.email || null,
        assigned_manager_id: existing.assigned_manager_id || manager.user_id,
        notes: appendLeadNotes(existing.notes, notes),
      },
      select: { lead_id: true, source: true },
    });
    return { lead, created: false };
  }

  const pipelineStatus =
    (await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" } })) ??
    (await tx.pipelineStatus.findUnique({ where: { status_code: "LEAD" } }));
  if (!pipelineStatus) {
    throw new FacebookMessengerIntegrationError(
      500,
      "missing_pipeline_status",
      "Pipeline status for new leads is not configured.",
    );
  }

  const lead = await tx.lead.create({
    data: {
      name: payload.name,
      phone: normalizeContactPhone(payload.phone),
      email: payload.email || null,
      source: FACEBOOK_MESSENGER_PROVIDER,
      notes,
      assigned_manager_id: manager.user_id,
      pipeline_status_id: pipelineStatus.pipeline_status_id,
    },
    select: { lead_id: true, source: true },
  });

  await onLeadCreated(tx, {
    actorUserId: actor.user_id,
    leadId: lead.lead_id,
    managerUserId: manager.user_id,
    leadNameOrTitle: payload.name,
  });
  return { lead, created: true };
}
