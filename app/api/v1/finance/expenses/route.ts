import { NextRequest } from "next/server";

import { getRecordManagerScope } from "@/features/sales/access";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const ACTION_KEY = "finance.expense.recorded";
const MAX_AMOUNT = 1_000_000;
const MAX_ROWS = 250;

type ExpenseScope = "deal" | "project";

type ExpenseInput = {
  scope_type?: unknown;
  scope_id?: unknown;
  category?: unknown;
  description?: unknown;
  amount?: unknown;
  payment_method?: unknown;
  paid_at?: unknown;
};

function asText(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function asScope(value: unknown): ExpenseScope | null {
  return value === "deal" || value === "project" ? value : null;
}

function asMoney(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  return Number(amount.toFixed(2));
}

function asPaidAt(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function canAccessScope(scope: ExpenseScope, scopeId: string, managerId?: string) {
  if (scope === "deal") {
    return prisma.deal.findFirst({
      where: {
        deal_id: scopeId,
        ...(managerId ? { assigned_manager_id: managerId } : {}),
      },
      select: { deal_id: true, title: true },
    });
  }

  return prisma.project.findFirst({
    where: {
      project_id: scopeId,
      ...(managerId ? { manager_id: managerId } : {}),
    },
    select: { project_id: true, title: true },
  });
}

function readExpense(activity: {
  activity_id: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: Date;
  actor_user: { user_id: string; full_name: string } | null;
}) {
  if (!activity.metadata || typeof activity.metadata !== "object" || Array.isArray(activity.metadata)) return null;
  const metadata = activity.metadata as Record<string, unknown>;
  const amount = Number(metadata.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    expense_id: activity.activity_id,
    scope_type: activity.entity_type === "project" ? "project" : "deal",
    scope_id: activity.entity_id,
    category: asText(metadata.category, 80),
    description: asText(metadata.description, 220),
    amount: Number(amount.toFixed(2)),
    payment_method: asText(metadata.payment_method, 40),
    paid_at: metadata.paid_at ? String(metadata.paid_at) : activity.created_at.toISOString(),
    created_at: activity.created_at,
    created_by: activity.actor_user
      ? { user_id: activity.actor_user.user_id, full_name: activity.actor_user.full_name }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Money tracker access denied.");
  }

  const requestedScope = asScope(request.nextUrl.searchParams.get("scope_type"));
  const requestedScopeId = asText(request.nextUrl.searchParams.get("scope_id"), 80);
  const managerId = getRecordManagerScope(auth.session);

  if ((requestedScope && !requestedScopeId) || (!requestedScope && requestedScopeId)) {
    return apiError(400, "invalid_scope", "scope_type and scope_id must be provided together.");
  }

  if (requestedScope && requestedScopeId) {
    const accessible = await canAccessScope(requestedScope, requestedScopeId, managerId);
    if (!accessible) return apiError(404, "not_found", "Record was not found.");
  }

  let allowedDealIds: string[] | undefined;
  let allowedProjectIds: string[] | undefined;

  if (managerId && !requestedScope) {
    const [deals, projects] = await Promise.all([
      prisma.deal.findMany({ where: { assigned_manager_id: managerId }, select: { deal_id: true } }),
      prisma.project.findMany({ where: { manager_id: managerId }, select: { project_id: true } }),
    ]);
    allowedDealIds = deals.map((item) => item.deal_id);
    allowedProjectIds = projects.map((item) => item.project_id);
  }

  const activities = await prisma.activityLog.findMany({
    where: {
      action_key: ACTION_KEY,
      ...(requestedScope && requestedScopeId
        ? { entity_type: requestedScope, entity_id: requestedScopeId }
        : managerId
          ? {
              OR: [
                { entity_type: "deal", entity_id: { in: allowedDealIds ?? [] } },
                { entity_type: "project", entity_id: { in: allowedProjectIds ?? [] } },
              ],
            }
          : { entity_type: { in: ["deal", "project"] } }),
    },
    orderBy: { created_at: "desc" },
    take: MAX_ROWS,
    select: {
      activity_id: true,
      entity_type: true,
      entity_id: true,
      metadata: true,
      created_at: true,
      actor_user: {
        select: { user_id: true, full_name: true },
      },
    },
  });

  const items = activities.flatMap((activity) => {
    const expense = readExpense(activity);
    return expense ? [expense] : [];
  });
  const total = Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2));

  return apiSuccess({ items, total });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Money tracker update denied.");
  }

  const body = (await request.json().catch(() => null)) as ExpenseInput | null;
  if (!body) return apiError(400, "invalid_payload", "Expense payload is required.");

  const scope = asScope(body.scope_type);
  const scopeId = asText(body.scope_id, 80);
  const category = asText(body.category, 80);
  const description = asText(body.description, 220);
  const amount = asMoney(body.amount);
  const paymentMethod = asText(body.payment_method, 40);
  const paidAt = asPaidAt(body.paid_at);

  if (!scope || !scopeId || !category || amount === null || !paidAt) {
    return apiError(400, "invalid_payload", "Scope, category, valid amount, and valid date are required.");
  }

  const managerId = getRecordManagerScope(auth.session);
  const accessible = await canAccessScope(scope, scopeId, managerId);
  if (!accessible) return apiError(404, "not_found", "Record was not found.");

  const activity = await prisma.activityLog.create({
    data: {
      actor_user_id: auth.session.user.user_id,
      entity_type: scope,
      entity_id: scopeId,
      project_id: scope === "project" ? scopeId : null,
      action_key: ACTION_KEY,
      message: `Фактический расход: ${category} — $${amount.toFixed(2)}.`,
      metadata: {
        category,
        description,
        amount,
        payment_method: paymentMethod || null,
        paid_at: paidAt.toISOString(),
      },
    },
    select: {
      activity_id: true,
      entity_type: true,
      entity_id: true,
      metadata: true,
      created_at: true,
      actor_user: {
        select: { user_id: true, full_name: true },
      },
    },
  });

  return apiSuccess({ expense: readExpense(activity) }, { status: 201 });
}
