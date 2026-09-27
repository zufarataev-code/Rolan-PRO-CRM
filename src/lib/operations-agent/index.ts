import { Prisma } from "@prisma/client";

import { addMeasurement, createConsultation } from "@/features/consultations/service";
import { createManualProject, getProjectCardByIdForSession } from "@/features/projects/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import {
  isHighRiskOperationsAction,
  isOperationsAgentAction,
  isOperationsAgentWriteAction,
  type OperationsAgentAction,
  type OperationsAgentReadAction,
  type OperationsAgentWriteAction,
} from "@/lib/operations-agent/policy";

const RECEIPT_ACTION_KEY = "operations_agent.request";
const EXPENSE_ACTION_KEY = "finance.expense.recorded";
const MAX_AMOUNT = 1_000_000;

export type OperationsAgentResult = {
  ok: boolean;
  action: string;
  summary: string;
  entity_type?: string;
  entity_id?: string;
  record_id?: string;
  audit_id?: string;
  duplicate?: boolean;
  needs_clarification?: boolean;
  candidates?: Array<Record<string, unknown>>;
  requires_approval?: boolean;
  error?: { code: string; message: string };
  client_id?: string;
  project_id?: string;
  expense_id?: string;
  task_id?: string;
  consultation_id?: string;
  measurement_id?: string;
  measurement_ids?: string[];
  items?: unknown[];
  project?: unknown;
};

type AgentActor = {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
};

type HandleInput = {
  action: string;
  args: Record<string, unknown>;
  idempotencyKey?: string | null;
  requestId?: string | null;
  initiator: string;
  actor: AgentActor;
};

type ReceiptRow = { activity_id: string; metadata: unknown };

function asText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max = 500) {
  const normalized = asText(value, max);
  return normalized || null;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asPositiveMoney(value: unknown) {
  const amount = asNumber(value);
  if (amount === null || amount <= 0 || amount > MAX_AMOUNT) return null;
  return Number(amount.toFixed(2));
}

function asDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 300) : value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/(secret|token|password|authorization|cookie|api.?key)/i.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = safeValue(item, depth + 1);
    }
  }
  return result;
}

function invalidResult(action: string, message: string, code = "invalid_payload"): OperationsAgentResult {
  return { ok: false, action, summary: message, error: { code, message } };
}

function clarificationResult(
  action: string,
  entityName: string,
  candidates: Array<Record<string, unknown>>,
): OperationsAgentResult {
  return {
    ok: false,
    action,
    summary: "Multiple " + entityName + " records matched. Choose one before writing.",
    needs_clarification: true,
    candidates,
    error: { code: "ambiguous_entity", message: "Multiple " + entityName + " records matched." },
  };
}

function storedResult(metadata: unknown) {
  const meta = asObject(metadata);
  const result = asObject(meta?.result);
  return result as OperationsAgentResult | null;
}

async function findReceipt(idempotencyKey: string) {
  const rows = await prisma.$queryRawUnsafe<ReceiptRow[]>(
    "SELECT activity_id, metadata FROM activity_log WHERE action_key = $1 AND metadata ->> 'idempotency_key' = $2 ORDER BY created_at DESC LIMIT 1",
    RECEIPT_ACTION_KEY,
    idempotencyKey,
  );
  return rows[0] ?? null;
}

async function reserveReceipt(input: HandleInput & { idempotencyKey: string }) {
  try {
    const receipt = await prisma.activityLog.create({
      data: {
        actor_user_id: input.actor.user_id,
        entity_type: "agent_request",
        entity_id: null,
        project_id: null,
        action_key: RECEIPT_ACTION_KEY,
        message: "CRM Operations Agent request: " + input.action,
        metadata: {
          idempotency_key: input.idempotencyKey,
          request_id: input.requestId ?? null,
          action: input.action,
          status: "processing",
          source: "chatgpt",
          initiator: input.initiator,
          input_summary: safeValue(input.args),
        } as Prisma.InputJsonValue,
      },
      select: { activity_id: true },
    });
    return { kind: "new" as const, auditId: receipt.activity_id };
  } catch (cause) {
    const existing = await findReceipt(input.idempotencyKey);
    if (existing) {
      return {
        kind: "existing" as const,
        auditId: existing.activity_id,
        result: storedResult(existing.metadata),
      };
    }
    throw cause;
  }
}

async function finishReceipt(
  auditId: string,
  input: HandleInput & { idempotencyKey: string },
  result: OperationsAgentResult,
) {
  const status = result.ok
    ? "succeeded"
    : result.needs_clarification
      ? "needs_clarification"
      : result.requires_approval
        ? "requires_approval"
        : "failed";

  await prisma.activityLog.update({
    where: { activity_id: auditId },
    data: {
      entity_type: result.entity_type ?? "agent_request",
      entity_id: result.entity_id ?? null,
      project_id: result.project_id ?? null,
      message: "CRM Operations Agent " + input.action + ": " + status,
      metadata: {
        idempotency_key: input.idempotencyKey,
        request_id: input.requestId ?? null,
        action: input.action,
        status,
        source: "chatgpt",
        initiator: input.initiator,
        input_summary: safeValue(input.args),
        result,
      } as Prisma.InputJsonValue,
    },
  });
}

export async function runIdempotentOperation(
  input: HandleInput & { idempotencyKey: string },
  execute: () => Promise<OperationsAgentResult>,
) {
  const reservation = await reserveReceipt(input);

  if (reservation.kind === "existing") {
    if (reservation.result) {
      return { ...reservation.result, audit_id: reservation.auditId, duplicate: true };
    }

    return {
      ok: false,
      action: input.action,
      summary: "The same CRM request is already processing or needs manual inspection.",
      audit_id: reservation.auditId,
      duplicate: true,
      error: {
        code: "request_in_progress",
        message: "The same idempotency key is already reserved. The business action was not re-run.",
      },
    } satisfies OperationsAgentResult;
  }

  try {
    const result = await execute();
    const completed = { ...result, audit_id: reservation.auditId };
    await finishReceipt(reservation.auditId, input, completed);
    return completed;
  } catch (cause) {
    console.error("operations_agent_action_failed", {
      action: input.action,
      requestId: input.requestId,
      error: cause instanceof Error ? cause.message : String(cause),
    });

    const failed = {
      ok: false,
      action: input.action,
      summary: "CRM rejected or failed the requested action.",
      audit_id: reservation.auditId,
      error: { code: "action_failed", message: "CRM action failed. No success was reported." },
    } satisfies OperationsAgentResult;

    await finishReceipt(reservation.auditId, input, failed).catch(() => undefined);
    return failed;
  }
}

export async function resolveOperationsAgentActor(): Promise<AgentActor | null> {
  const userId = process.env.CRM_OPERATIONS_AGENT_ACTOR_USER_ID?.trim();
  const email = process.env.CRM_OPERATIONS_AGENT_ACTOR_EMAIL?.trim().toLowerCase();
  if (!userId && !email) return null;

  const user = await prisma.user.findFirst({
    where: {
      is_active: true,
      ...(userId ? { user_id: userId } : { email }),
      user_accesses: {
        some: {
          is_active: true,
          role: {
            is_active: true,
            code: ROLE_CODES.OWNER,
          },
        },
      },
    },
    select: {
      user_id: true,
      email: true,
      full_name: true,
      user_accesses: {
        where: { is_active: true, role: { is_active: true } },
        select: { role: { select: { code: true } } },
      },
    },
  });

  if (!user) return null;

  return {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    roles: user.user_accesses.map((entry) => entry.role.code),
  };
}

function actorSession(actor: AgentActor) {
  return { user: { user_id: actor.user_id }, roles: actor.roles };
}

async function findClientCandidates(query: string) {
  return prisma.client.findMany({
    where: {
      OR: [
        { client_code: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
        { service_address: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 6,
    select: {
      client_id: true,
      client_code: true,
      name: true,
      phone: true,
      email: true,
      service_address: true,
    },
  });
}

async function matchingClientIds(query: string) {
  const clients = await findClientCandidates(query);
  return clients.map((client) => client.client_id);
}

async function findProjectCandidates(query: string) {
  const clientIds = await matchingClientIds(query);
  return prisma.project.findMany({
    where: {
      OR: [
        { project_code: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { address: { contains: query, mode: "insensitive" } },
        ...(clientIds.length ? [{ client_id: { in: clientIds } }] : []),
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 6,
    select: {
      project_id: true,
      project_code: true,
      title: true,
      address: true,
      manager_id: true,
      client_id: true,
      client: { select: { name: true } },
    },
  });
}

async function resolveProject(args: Record<string, unknown>) {
  const projectId = asText(args.project_id, 80);
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { project_id: projectId },
      select: {
        project_id: true,
        project_code: true,
        title: true,
        address: true,
        manager_id: true,
        client_id: true,
        client: { select: { name: true } },
      },
    });
    return project ? { project } : { error: "Project was not found." };
  }

  const query = asText(args.project_query ?? args.project, 160);
  if (!query) return { error: "project_id or project_query is required." };

  const candidates = await findProjectCandidates(query);
  if (candidates.length === 1) return { project: candidates[0] };
  if (candidates.length === 0) return { error: "Project was not found." };

  return {
    clarification: candidates.map((project) => ({
      project_id: project.project_id,
      project_code: project.project_code,
      title: project.title,
      client_name: project.client.name,
      address: project.address,
    })),
  };
}

async function resolveClient(args: Record<string, unknown>) {
  const clientId = asText(args.client_id, 80);
  if (clientId) {
    const client = await prisma.client.findUnique({
      where: { client_id: clientId },
      select: {
        client_id: true,
        client_code: true,
        name: true,
        phone: true,
        email: true,
        service_address: true,
      },
    });
    return client ? { client } : { error: "Client was not found." };
  }

  const query = asText(args.client_query ?? args.client, 160);
  if (!query) return { error: "client_id or client_query is required." };

  const candidates = await findClientCandidates(query);
  if (candidates.length === 1) return { client: candidates[0] };
  if (candidates.length === 0) return { error: "Client was not found." };
  return { clarification: candidates };
}

async function executeRead(
  action: OperationsAgentReadAction,
  args: Record<string, unknown>,
  actor: AgentActor,
): Promise<OperationsAgentResult> {
  if (action === "find_client") {
    const query = asText(args.query, 160);
    if (!query) return invalidResult(action, "query is required.");
    const items = await findClientCandidates(query);
    return { ok: true, action, summary: "Found " + items.length + " client(s).", items };
  }

  if (action === "find_project") {
    const query = asText(args.query, 160);
    if (!query) return invalidResult(action, "query is required.");
    const items = await findProjectCandidates(query);
    return { ok: true, action, summary: "Found " + items.length + " project(s).", items };
  }

  if (action === "get_project") {
    const projectId = asText(args.project_id, 80);
    if (!projectId) return invalidResult(action, "project_id is required.");
    const project = await getProjectCardByIdForSession(actorSession(actor), projectId);
    if (!project) return invalidResult(action, "Project was not found.", "not_found");
    return {
      ok: true,
      action,
      summary: "Loaded project " + project.title + ".",
      entity_type: "project",
      entity_id: projectId,
      project_id: projectId,
      project,
    };
  }

  if (action === "find_lead_or_deal") {
    const query = asText(args.query, 160);
    if (!query) return invalidResult(action, "query is required.");

    const [leads, deals] = await Promise.all([
      prisma.lead.findMany({
        where: {
          OR: [
            { lead_code: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 6,
        orderBy: { updated_at: "desc" },
        select: {
          lead_id: true,
          lead_code: true,
          name: true,
          phone: true,
          email: true,
          source: true,
        },
      }),
      prisma.deal.findMany({
        where: {
          OR: [
            { deal_code: { contains: query, mode: "insensitive" } },
            { title: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 6,
        orderBy: { updated_at: "desc" },
        select: {
          deal_id: true,
          deal_code: true,
          title: true,
          client_id: true,
          lead_id: true,
        },
      }),
    ]);

    return {
      ok: true,
      action,
      summary: "Found " + (leads.length + deals.length) + " lead/deal record(s).",
      items: [...leads, ...deals],
    };
  }

  const start = asDate(args.start_at) ?? new Date();
  const end = asDate(args.end_at) ?? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (end <= start) return invalidResult(action, "end_at must be after start_at.");

  const consultantId = asText(args.assigned_consultant_id, 80);
  const items = await prisma.consultation.findMany({
    where: {
      scheduled_start_at: { gte: start, lt: end },
      ...(consultantId ? { assigned_consultant_id: consultantId } : {}),
    },
    orderBy: { scheduled_start_at: "asc" },
    take: 100,
    select: {
      consultation_id: true,
      title: true,
      scheduled_start_at: true,
      scheduled_end_at: true,
      status: true,
      location_address: true,
      assigned_consultant: { select: { user_id: true, full_name: true } },
      client: { select: { client_id: true, name: true } },
      project: { select: { project_id: true, title: true } },
    },
  });

  return {
    ok: true,
    action,
    summary: "Found " + items.length + " consultation(s) in schedule.",
    items,
  };
}

async function executeWrite(
  action: OperationsAgentWriteAction,
  args: Record<string, unknown>,
  actor: AgentActor,
): Promise<OperationsAgentResult> {
  if (action === "create_client") {
    const name = asText(args.name, 160);
    if (!name) return invalidResult(action, "name is required.");

    const email = optionalText(args.email, 191)?.toLowerCase() ?? null;
    const phone = optionalText(args.phone, 40);

    if (email || phone) {
      const duplicates = await prisma.client.findMany({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
        take: 6,
        select: {
          client_id: true,
          client_code: true,
          name: true,
          phone: true,
          email: true,
          service_address: true,
        },
      });
      if (duplicates.length) return clarificationResult(action, "client", duplicates);
    }

    const client = await prisma.client.create({
      data: {
        name,
        phone,
        email,
        billing_address: optionalText(args.billing_address, 1000),
        service_address: optionalText(args.service_address, 1000),
        city_id: optionalText(args.city_id, 80),
        zip_code: optionalText(args.zip_code, 20),
        notes: optionalText(args.notes, 4000),
      },
      select: { client_id: true, name: true },
    });

    return {
      ok: true,
      action,
      summary: "Created client " + client.name + ".",
      entity_type: "client",
      entity_id: client.client_id,
      record_id: client.client_id,
      client_id: client.client_id,
    };
  }

  if (action === "update_client_contact_address") {
    const resolution = await resolveClient(args);
    if ("clarification" in resolution) {
      return clarificationResult(action, "client", resolution.clarification ?? []);
    }
    if (!resolution.client) {
      return invalidResult(action, resolution.error ?? "Client was not found.", "not_found");
    }

    const client = await prisma.client.update({
      where: { client_id: resolution.client.client_id },
      data: {
        phone: args.phone !== undefined ? optionalText(args.phone, 40) : undefined,
        email:
          args.email !== undefined
            ? optionalText(args.email, 191)?.toLowerCase() ?? null
            : undefined,
        billing_address:
          args.billing_address !== undefined ? optionalText(args.billing_address, 1000) : undefined,
        service_address:
          args.service_address !== undefined ? optionalText(args.service_address, 1000) : undefined,
        city_id: args.city_id !== undefined ? optionalText(args.city_id, 80) : undefined,
        zip_code: args.zip_code !== undefined ? optionalText(args.zip_code, 20) : undefined,
      },
      select: { client_id: true, name: true },
    });

    return {
      ok: true,
      action,
      summary: "Updated contact/address for " + client.name + ".",
      entity_type: "client",
      entity_id: client.client_id,
      record_id: client.client_id,
      client_id: client.client_id,
    };
  }

  if (action === "create_manual_project") {
    const clientId = asText(args.client_id, 80);
    let clientName = asText(args.client_name, 160);
    let phone = optionalText(args.phone, 40);
    let email = optionalText(args.email, 191)?.toLowerCase() ?? null;
    let address = optionalText(args.service_address, 1000);
    let cityId = optionalText(args.city_id, 80);
    let zipCode = optionalText(args.zip_code, 20);

    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { client_id: clientId },
        select: {
          name: true,
          phone: true,
          email: true,
          service_address: true,
          city_id: true,
          zip_code: true,
        },
      });
      if (!client) return invalidResult(action, "Client was not found.", "not_found");

      clientName = client.name;
      phone = phone ?? client.phone;
      email = email ?? client.email;
      address = address ?? client.service_address;
      cityId = cityId ?? client.city_id;
      zipCode = zipCode ?? client.zip_code;

      if (!phone && !email) {
        return invalidResult(
          action,
          "Existing client needs phone or email so canonical project creation can reuse it safely.",
        );
      }
    }

    const projectTitle = asText(args.project_title, 160);
    const serviceTypeId = asText(args.service_type_id, 80);
    const filmId = asText(args.film_id, 80);
    const billableSqft = asNumber(args.billable_sqft);

    if (!clientName || !projectTitle || !serviceTypeId || !filmId || !billableSqft || billableSqft <= 0) {
      return invalidResult(
        action,
        "client_name/client_id, project_title, service_type_id, film_id and positive billable_sqft are required.",
      );
    }

    const created = await createManualProject(actorSession(actor), {
      client_name: clientName,
      phone,
      email,
      city_id: cityId,
      service_address: address,
      zip_code: zipCode,
      project_title: projectTitle,
      service_type_id: serviceTypeId,
      film_id: filmId,
      billable_sqft: billableSqft,
      actual_film_sqft: asNumber(args.actual_film_sqft),
      client_unit_price: asNumber(args.client_unit_price),
      installation_cost_per_sqft: null,
      extra_costs: asNumber(args.extra_costs),
      installer_id: optionalText(args.installer_id, 80),
      project_notes: optionalText(args.project_notes, 4000),
      position_notes: optionalText(args.position_notes, 4000),
    });

    if (typeof created === "string") {
      return invalidResult(action, "Project creation failed: " + created + ".", created);
    }

    const project = await prisma.project.findUnique({
      where: { project_id: created.project_id },
      select: { project_id: true, client_id: true, title: true },
    });
    if (!project) throw new Error("Created project could not be reloaded.");

    return {
      ok: true,
      action,
      summary: "Created project " + project.title + ".",
      entity_type: "project",
      entity_id: project.project_id,
      record_id: project.project_id,
      project_id: project.project_id,
      client_id: project.client_id,
    };
  }

  if (action === "update_project_notes" || action === "add_project_note") {
    const resolution = await resolveProject(args);
    if ("clarification" in resolution) {
      return clarificationResult(action, "project", resolution.clarification ?? []);
    }
    if (!resolution.project) {
      return invalidResult(action, resolution.error ?? "Project was not found.", "not_found");
    }

    const note = asText(args.notes ?? args.note, 4000);
    if (!note) return invalidResult(action, "notes is required.");

    const current = await prisma.project.findUnique({
      where: { project_id: resolution.project.project_id },
      select: { manager_notes: true },
    });
    const nextNotes =
      action === "add_project_note"
        ? [current?.manager_notes ?? "", note].filter(Boolean).join("\n")
        : note;

    await prisma.project.update({
      where: { project_id: resolution.project.project_id },
      data: { manager_notes: nextNotes },
    });

    return {
      ok: true,
      action,
      summary: action === "add_project_note" ? "Added project note." : "Updated project notes.",
      entity_type: "project",
      entity_id: resolution.project.project_id,
      record_id: resolution.project.project_id,
      project_id: resolution.project.project_id,
    };
  }

  if (action === "record_project_expense") {
    const resolution = await resolveProject(args);
    if ("clarification" in resolution) {
      return clarificationResult(action, "project", resolution.clarification ?? []);
    }
    if (!resolution.project) {
      return invalidResult(action, resolution.error ?? "Project was not found.", "not_found");
    }

    const category = asText(args.category, 80);
    const amount = asPositiveMoney(args.amount);
    const paidAt = args.paid_at ? asDate(args.paid_at) : new Date();
    if (!category || amount === null || !paidAt) {
      return invalidResult(action, "category, positive amount and valid paid_at are required.");
    }

    const expense = await prisma.activityLog.create({
      data: {
        actor_user_id: actor.user_id,
        entity_type: "project",
        entity_id: resolution.project.project_id,
        project_id: resolution.project.project_id,
        action_key: EXPENSE_ACTION_KEY,
        message: "Фактический расход: " + category + " — $" + amount.toFixed(2) + ".",
        metadata: {
          category,
          description: asText(args.description, 220),
          amount,
          payment_method: optionalText(args.payment_method, 40),
          paid_at: paidAt.toISOString(),
          source: "chatgpt_ops_agent",
        },
      },
      select: { activity_id: true },
    });

    return {
      ok: true,
      action,
      summary: "Recorded $" + amount.toFixed(2) + " expense for " + resolution.project.title + ".",
      entity_type: "project",
      entity_id: resolution.project.project_id,
      record_id: expense.activity_id,
      project_id: resolution.project.project_id,
      expense_id: expense.activity_id,
    };
  }

  if (action === "create_task") {
    const title = asText(args.title, 180);
    if (!title) return invalidResult(action, "title is required.");

    let entityType = optionalText(args.entity_type, 60);
    let entityId = optionalText(args.entity_id, 80);
    let assignedTo = optionalText(args.assigned_to, 80);

    if (args.project_id || args.project_query || args.project) {
      const resolution = await resolveProject(args);
      if ("clarification" in resolution) {
        return clarificationResult(action, "project", resolution.clarification ?? []);
      }
      if (!resolution.project) {
        return invalidResult(action, resolution.error ?? "Project was not found.", "not_found");
      }
      entityType = "project";
      entityId = resolution.project.project_id;
      assignedTo = assignedTo ?? resolution.project.manager_id ?? actor.user_id;
    }

    const dueAt = args.due_at ? asDate(args.due_at) : null;
    if (args.due_at && !dueAt) return invalidResult(action, "due_at is invalid.");

    const task = await prisma.task.create({
      data: {
        lead_id: optionalText(args.lead_id, 80),
        deal_id: optionalText(args.deal_id, 80),
        entity_type: entityType,
        entity_id: entityId,
        title,
        description: optionalText(args.description, 4000),
        status: optionalText(args.status, 40) ?? "open",
        priority: optionalText(args.priority, 30) ?? "normal",
        due_at: dueAt,
        assigned_to: assignedTo ?? actor.user_id,
        created_by: actor.user_id,
      },
      select: { task_id: true, title: true },
    });

    return {
      ok: true,
      action,
      summary: "Created task " + task.title + ".",
      entity_type: "task",
      entity_id: task.task_id,
      record_id: task.task_id,
      task_id: task.task_id,
    };
  }

  if (action === "update_task") {
    const taskId = asText(args.task_id, 80);
    if (!taskId) return invalidResult(action, "task_id is required.");

    const existing = await prisma.task.findUnique({
      where: { task_id: taskId },
      select: { task_id: true },
    });
    if (!existing) return invalidResult(action, "Task was not found.", "not_found");

    const dueAt = args.due_at !== undefined ? asDate(args.due_at) : undefined;
    if (args.due_at && !dueAt) return invalidResult(action, "due_at is invalid.");
    const status = args.status !== undefined ? asText(args.status, 40) || undefined : undefined;

    await prisma.task.update({
      where: { task_id: taskId },
      data: {
        title: args.title !== undefined ? asText(args.title, 180) || undefined : undefined,
        description:
          args.description !== undefined ? optionalText(args.description, 4000) : undefined,
        status,
        priority: args.priority !== undefined ? optionalText(args.priority, 30) ?? undefined : undefined,
        due_at: dueAt,
        assigned_to:
          args.assigned_to !== undefined ? optionalText(args.assigned_to, 80) : undefined,
        completed_at: status === "done" ? new Date() : status ? null : undefined,
      },
    });

    return {
      ok: true,
      action,
      summary: "Updated task.",
      entity_type: "task",
      entity_id: taskId,
      record_id: taskId,
      task_id: taskId,
    };
  }

  if (action === "create_consultation") {
    const title = asText(args.title, 180);
    const consultantId = asText(args.assigned_consultant_id, 80);
    const startsAt = asDate(args.scheduled_start_at);
    const endsAt = asDate(args.scheduled_end_at);

    if (!title || !consultantId || !startsAt || !endsAt || endsAt <= startsAt) {
      return invalidResult(
        action,
        "title, assigned_consultant_id and a valid start/end window are required.",
      );
    }

    let projectId = optionalText(args.project_id, 80);
    let clientId = optionalText(args.client_id, 80);
    let managerId = optionalText(args.assigned_manager_id, 80);
    let address = optionalText(args.location_address, 1000);

    if (args.project_query || args.project) {
      const resolution = await resolveProject(args);
      if ("clarification" in resolution) {
        return clarificationResult(action, "project", resolution.clarification ?? []);
      }
      if (!resolution.project) {
        return invalidResult(action, resolution.error ?? "Project was not found.", "not_found");
      }
      projectId = resolution.project.project_id;
      clientId = clientId ?? resolution.project.client_id;
      managerId = managerId ?? resolution.project.manager_id;
      address = address ?? resolution.project.address;
    }

    const consultation = await createConsultation(actor.user_id, {
      title,
      assigned_consultant_id: consultantId,
      assigned_manager_id: managerId,
      lead_id: optionalText(args.lead_id, 80),
      deal_id: optionalText(args.deal_id, 80),
      client_id: clientId,
      project_id: projectId,
      location_address: address,
      manager_notes: optionalText(args.manager_notes, 4000),
      scheduled_start_at: startsAt.toISOString(),
      scheduled_end_at: endsAt.toISOString(),
    });

    return {
      ok: true,
      action,
      summary: "Created consultation " + title + ".",
      entity_type: "consultation",
      entity_id: consultation.consultation_id,
      record_id: consultation.consultation_id,
      consultation_id: consultation.consultation_id,
      ...(projectId ? { project_id: projectId } : {}),
      ...(clientId ? { client_id: clientId } : {}),
    };
  }

  const consultationId = asText(args.consultation_id, 80);
  if (!consultationId) return invalidResult(action, "consultation_id is required.");

  const rows = Array.isArray(args.measurements)
    ? args.measurements
    : args.measurement
      ? [args.measurement]
      : [args];

  if (rows.length < 1 || rows.length > 100) {
    return invalidResult(action, "measurements must contain 1 to 100 rows.");
  }

  const normalizedRows: Array<Record<string, unknown>> = [];
  for (const raw of rows) {
    const measurement = asObject(raw);
    if (!measurement || !asText(measurement.room_name, 160)) {
      return invalidResult(action, "Each measurement requires room_name.");
    }
    normalizedRows.push(measurement);
  }

  const measurementIds: string[] = [];
  for (const measurement of normalizedRows) {
    const created = await addMeasurement(actorSession(actor), consultationId, {
      room_name: asText(measurement.room_name, 160),
      office_name: optionalText(measurement.office_name, 160),
      zone_name: optionalText(measurement.zone_name, 160),
      floor: optionalText(measurement.floor, 80),
      window_id: optionalText(measurement.window_id, 80),
      width: asNumber(measurement.width),
      height: asNumber(measurement.height),
      sqft: asNumber(measurement.sqft),
      quantity: asNumber(measurement.quantity),
      glass_type: optionalText(measurement.glass_type, 120),
      orientation: optionalText(measurement.orientation, 80),
      access_type: optionalText(measurement.access_type, 80),
      complexity_level_id: optionalText(measurement.complexity_level_id, 80),
      notes: optionalText(measurement.notes, 4000),
      sort_order: asNumber(measurement.sort_order) ?? 0,
    });

    if (!created) {
      return invalidResult(action, "Consultation or survey was not found.", "not_found");
    }
    measurementIds.push(created.measurement_id);
  }

  return {
    ok: true,
    action,
    summary: "Recorded " + measurementIds.length + " measurement(s).",
    entity_type: "measurement",
    entity_id: measurementIds[0],
    record_id: measurementIds[0],
    measurement_id: measurementIds[0],
    measurement_ids: measurementIds,
    consultation_id: consultationId,
  };
}

export function classifyOperationsAgentAction(action: string) {
  if (isOperationsAgentAction(action)) return isOperationsAgentWriteAction(action) ? "write" : "read";
  if (isHighRiskOperationsAction(action)) return "approval";
  return "unsupported";
}

export async function handleOperationsAgentAction(input: HandleInput): Promise<OperationsAgentResult> {
  const action = input.action.trim();
  if (!action) return invalidResult("unknown", "action is required.");

  const classification = classifyOperationsAgentAction(action);

  if (classification === "approval") {
    const blocked: OperationsAgentResult = {
      ok: false,
      action,
      summary: "This action is high-risk and requires a separate approved workflow.",
      requires_approval: true,
      error: {
        code: "approval_required",
        message: "High-risk action is not enabled for CRM Operations Agent phase 1.",
      },
    };

    const key = asText(input.idempotencyKey, 191);
    if (!key || key.length < 8) return blocked;

    return runIdempotentOperation(
      { ...input, action, idempotencyKey: key },
      async () => blocked,
    );
  }

  if (classification === "unsupported") {
    return invalidResult(action, "Action is not allowlisted.", "unsupported_action");
  }

  const typedAction = action as OperationsAgentAction;

  if (!isOperationsAgentWriteAction(typedAction)) {
    return executeRead(typedAction, input.args, input.actor);
  }

  const idempotencyKey = asText(input.idempotencyKey, 191);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return invalidResult(action, "A stable idempotency_key of at least 8 characters is required.");
  }

  return runIdempotentOperation(
    { ...input, action, idempotencyKey },
    () => executeWrite(typedAction, input.args, input.actor),
  );
}
