import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { buildLeadAccessWhere, getRecordManagerScope } from "@/features/sales/access";
import { MANAGER_ROLES, getPipelineStatusId } from "@/features/sales/api";
import { OPEN_LEAD_STATUS_CODES, claimableBy } from "@/features/sales/lead-claim";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ leadId: string }> };

/**
 * «Создать проект» from a shared-queue lead in three steps, so a lead never
 * disappears without a saved project and is never converted twice:
 *   claim    — reserve an open lead (it stays open and visible);
 *   complete — after the project is saved, close it (CONTACTED) and assign it;
 *   release  — give the reservation back when the project could not be saved.
 * Only the claimant can complete or release; a stale claim can be taken over.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Lead claim denied.");
  }

  const { leadId } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "claim" && action !== "complete" && action !== "release") {
    return apiError(400, "invalid_payload", "action must be claim, complete or release.");
  }

  const userId = auth.session.user.user_id;
  const managerId = getRecordManagerScope(auth.session);
  const now = new Date();
  const open: Prisma.LeadWhereInput = { pipeline_status: { status_code: { in: OPEN_LEAD_STATUS_CODES } } };
  const base = buildLeadAccessWhere(leadId, managerId);

  let where: Prisma.LeadWhereInput;
  let data: Prisma.LeadUncheckedUpdateManyInput;
  if (action === "claim") {
    where = { AND: [base, open, claimableBy(userId, now)] };
    data = { claimed_by_user_id: userId, claimed_at: now };
  } else if (action === "complete") {
    const contacted = await getPipelineStatusId("CONTACTED");
    if (!contacted) return apiError(500, "missing_pipeline_status", "CONTACTED pipeline status is not configured.");
    where = { AND: [base, open, { claimed_by_user_id: userId }] };
    data = {
      pipeline_status_id: contacted.pipeline_status_id,
      claimed_by_user_id: null,
      claimed_at: null,
      ...(managerId ? { assigned_manager_id: managerId } : {}),
    };
  } else {
    where = { AND: [base, { claimed_by_user_id: userId }] };
    data = { claimed_by_user_id: null, claimed_at: null };
  }

  const result = await prisma.lead.updateMany({ where, data });
  if (result.count !== 1) {
    const visible = await prisma.lead.count({ where: base });
    if (!visible) return apiError(404, "not_found", "Lead was not found.");
    return apiError(
      409,
      "lead_claim_conflict",
      action === "claim"
        ? "Эту заявку уже оформляет другой менеджер или она обработана — обновите список."
        : "Бронь заявки истекла или принадлежит другому менеджеру — обновите список.",
    );
  }
  return apiSuccess({ lead_id: leadId, action });
}
