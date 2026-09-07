import { NextRequest } from "next/server";

import { buildDealAccessWhere, getRecordManagerScope } from "@/features/sales/access";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    dealId: string;
  }>;
};

type PlannedExpenseInput = {
  label?: unknown;
  amount?: unknown;
};

const ACTION_KEY = "deal.planned_expenses.updated";
const MAX_ITEMS = 30;
const MAX_AMOUNT = 1_000_000;

function readItems(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const raw = (metadata as { items?: unknown }).items;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const label = String((item as { label?: unknown }).label ?? "").trim().slice(0, 120);
    const amount = Number((item as { amount?: unknown }).amount ?? 0);
    if (!label || !Number.isFinite(amount) || amount < 0) return [];
    return [{ label, amount: Number(amount.toFixed(2)) }];
  });
}

async function canAccessDeal(dealId: string, managerId: string | null) {
  return prisma.deal.findFirst({
    where: buildDealAccessWhere(dealId, managerId),
    select: { deal_id: true },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Planned expense access denied.");
  }

  const { dealId } = await context.params;
  const managerId = getRecordManagerScope(auth.session);
  const deal = await canAccessDeal(dealId, managerId);
  if (!deal) return apiError(404, "not_found", "Deal was not found.");

  const snapshot = await prisma.activityLog.findFirst({
    where: {
      entity_type: "deal",
      entity_id: dealId,
      action_key: ACTION_KEY,
    },
    orderBy: { created_at: "desc" },
    select: { metadata: true, created_at: true },
  });

  const items = readItems(snapshot?.metadata ?? null);
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return apiSuccess({
    items,
    total: Number(total.toFixed(2)),
    updated_at: snapshot?.created_at ?? null,
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Planned expense update denied.");
  }

  const { dealId } = await context.params;
  const managerId = getRecordManagerScope(auth.session);
  const deal = await canAccessDeal(dealId, managerId);
  if (!deal) return apiError(404, "not_found", "Deal was not found.");

  const body = (await request.json().catch(() => null)) as { items?: PlannedExpenseInput[] } | null;
  if (!body || !Array.isArray(body.items)) {
    return apiError(400, "invalid_payload", "items must be an array.");
  }
  if (body.items.length > MAX_ITEMS) {
    return apiError(400, "too_many_items", `No more than ${MAX_ITEMS} planned expenses are allowed.`);
  }

  const items: Array<{ label: string; amount: number }> = [];
  for (const item of body.items) {
    const label = String(item?.label ?? "").trim().slice(0, 120);
    const amount = Number(item?.amount ?? 0);
    if (!label) return apiError(400, "invalid_label", "Every planned expense needs a name.");
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return apiError(400, "invalid_amount", "Planned expense amount is invalid.");
    }
    items.push({ label, amount: Number(amount.toFixed(2)) });
  }

  const total = Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2));

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "deal",
    entityId: dealId,
    actionKey: ACTION_KEY,
    message: `Плановые дополнительные расходы обновлены: $${total.toFixed(2)}.`,
    metadata: { items, total },
  });

  return apiSuccess({ items, total });
}
