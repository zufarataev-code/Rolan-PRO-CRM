import { Prisma } from "@prisma/client";

import { onLeadCreated } from "@/features/core/events";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

import {
  ExternalApiError,
  externalContactIdentity,
  externalLeadEventKey,
  externalLeadPayloadHash,
  parseExternalLeadPayload,
  type ExternalLeadPayload,
} from "./external-api-core";

const EXTERNAL_API_LEAD_ACTION = "integration.external_api.lead";
const OPEN_LEAD_STATUS_CODES = ["NEW_LEAD", "LEAD", "CONSULTATION_SCHEDULED"];

type DbClient = Prisma.TransactionClient;
type IntegrationAccess = {
  role: { code: string; is_active: boolean };
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

function configuredUserReference(prefix: "ACTOR" | "DEFAULT_MANAGER", required: boolean) {
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
  label: string,
) {
  const user = reference.userId
    ? await tx.user.findUnique({ where: { user_id: reference.userId }, select: USER_SELECT })
    : await tx.user.findUnique({ where: { email: reference.email! }, select: USER_SELECT });

  const roles =
    user?.user_accesses
      .filter((access: IntegrationAccess) => access.role.is_active)
      .map((access: IntegrationAccess) => access.role.code) ?? [];

  if (!user?.is_active || ![ROLE_CODES.OWNER, ROLE_CODES.MANAGER].some((role) => roles.includes(role))) {
    throw new ExternalApiError(
      503,
      "external_api_not_configured",
      `${label} must be an active OWNER or MANAGER.`,
    );
  }

  return { user_id: user.user_id, full_name: user.full_name, email: user.email };
}

async function resolveActorAndManager(tx: DbClient) {
  const actor = await resolveConfiguredUser(
    tx,
    configuredUserReference("ACTOR", true)!,
    "External API actor",
  );
  const managerReference = configuredUserReference("DEFAULT_MANAGER", false);
  const manager = managerReference
    ? await resolveConfiguredUser(tx, managerReference, "External API default manager")
    : actor;

  return { actor, manager };
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

async function findReceipt(tx: DbClient, eventKey: string) {
  const rows = await tx.$queryRaw<ReceiptRow[]>`
    SELECT metadata
    FROM activity_log
    WHERE action_key = ${EXTERNAL_API_LEAD_ACTION}
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

function receiptResult(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const result = (metadata as Record<string, unknown>).result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as ExternalLeadResult)
    : null;
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
    });
    if (byIdentity) return byIdentity;
  }

  if (payload.email) {
    const byEmail = await tx.lead.findFirst({
      where: { ...baseWhere, email: payload.email },
      orderBy: { updated_at: "desc" },
    });
    if (byEmail) return byEmail;
  }

  const normalizedPhone = normalizePhone(payload.phone);
  const phoneCandidates = await tx.lead.findMany({
    where: { ...baseWhere, phone: { not: null } },
    orderBy: { updated_at: "desc" },
  });

  return (
    phoneCandidates.find(
      (lead) => lead.phone && normalizePhone(lead.phone) === normalizedPhone,
    ) ?? null
  );
}

export type ExternalLeadResult = {
  lead_id: string;
  created: boolean;
  source: string | null;
  idempotent_replay: boolean;
};

export async function captureExternalLead(value: unknown): Promise<ExternalLeadResult> {
  const payload = parseExternalLeadPayload(value);
  const eventKey = externalLeadEventKey(payload);
  const payloadHash = externalLeadPayloadHash(payload);

  return prisma.$transaction(async (tx) => {
    await acquireLock(tx, "rolanpro-external-event", eventKey);

    const receipt = await findReceipt(tx, eventKey);
    if (receipt) {
      if (receiptPayloadHash(receipt) !== payloadHash) {
        throw new ExternalApiError(
          409,
          "idempotency_conflict",
          "This source/external_id pair was already used with a different payload.",
        );
      }

      const previous = receiptResult(receipt);
      if (previous) return { ...previous, idempotent_replay: true };
    }

    const contactIdentity = externalContactIdentity(payload);
    if (contactIdentity) {
      await acquireLock(tx, "rolanpro-external-contact", contactIdentity);
    }

    const { actor, manager } = await resolveActorAndManager(tx);
    const notes = buildLeadNotes(payload);
    const existing = await findReusableLead(tx, payload);

    let lead;
    let created = false;

    if (existing) {
      lead = await tx.lead.update({
        where: { lead_id: existing.lead_id },
        data: {
          phone: existing.phone || normalizePhone(payload.phone),
          email: existing.email || payload.email || null,
          assigned_manager_id: existing.assigned_manager_id || manager.user_id,
          notes: appendNotes(existing.notes, notes),
        },
      });
    } else {
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

      lead = await tx.lead.create({
        data: {
          name: payload.name,
          phone: normalizePhone(payload.phone),
          email: payload.email || null,
          source: payload.source,
          notes,
          assigned_manager_id: manager.user_id,
          pipeline_status_id: pipelineStatus.pipeline_status_id,
        },
      });
      created = true;

      await onLeadCreated(tx, {
        actorUserId: actor.user_id,
        leadId: lead.lead_id,
        managerUserId: manager.user_id,
        leadNameOrTitle: lead.name,
      });
    }

    const result: ExternalLeadResult = {
      lead_id: lead.lead_id,
      created,
      source: lead.source,
      idempotent_replay: false,
    };

    await tx.activityLog.create({
      data: {
        actor_user_id: actor.user_id,
        entity_type: "lead",
        entity_id: lead.lead_id,
        action_key: EXTERNAL_API_LEAD_ACTION,
        message: `External API captured lead ${lead.name} from ${payload.source}.`,
        metadata: {
          provider: payload.source,
          event_key: eventKey,
          external_id: payload.external_id,
          payload_hash: payloadHash,
          result: result as Prisma.InputJsonValue,
        },
      },
    });

    return result;
  });
}
