import { NextRequest } from "next/server";

import { buildDealAccessWhere, getRecordManagerScope } from "@/features/sales/access";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deal timeline access denied.");
  }

  const { dealId } = await context.params;
  const managerId = getRecordManagerScope(auth.session);
  const deal = await prisma.deal.findFirst({
    where: buildDealAccessWhere(dealId, managerId),
    select: {
      deal_id: true,
      deal_code: true,
      title: true,
      created_at: true,
      updated_at: true,
      pipeline_status: {
        select: {
          status_code: true,
          name_ru: true,
        },
      },
      lead: {
        select: {
          created_at: true,
        },
      },
    },
  });

  if (!deal) {
    return apiError(404, "not_found", "Deal was not found.");
  }

  const [consultation, proposal, closedEvent, project] = await Promise.all([
    prisma.consultation.findFirst({
      where: { deal_id: dealId },
      orderBy: [{ scheduled_start_at: "desc" }, { created_at: "desc" }],
      select: {
        scheduled_start_at: true,
        scheduled_end_at: true,
        status: true,
        survey: {
          select: {
            status: true,
            completed_at: true,
          },
        },
      },
    }),
    prisma.proposal.findFirst({
      where: { deal_id: dealId },
      orderBy: { created_at: "desc" },
      select: {
        proposal_id: true,
        created_at: true,
        sent_at: true,
        status: true,
        agreement: {
          select: {
            status: true,
            signed_at: true,
          },
        },
        deposit: {
          select: {
            status: true,
            paid_at: true,
          },
        },
      },
    }),
    prisma.activityLog.findFirst({
      where: {
        entity_type: "deal",
        entity_id: dealId,
        action_key: "sales.closed_won",
      },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
    prisma.project.findFirst({
      where: { deal_id: dealId },
      orderBy: { created_at: "desc" },
      select: {
        project_id: true,
        project_code: true,
        created_at: true,
      },
    }),
  ]);

  const leadDate = deal.lead?.created_at ?? deal.created_at;
  const surveyDoneAt = consultation?.survey?.completed_at ?? null;
  const surveyPlannedAt = surveyDoneAt ? null : consultation?.scheduled_start_at ?? null;
  const proposalDate = proposal?.sent_at ?? proposal?.created_at ?? null;
  const agreementDate = proposal?.agreement?.signed_at ?? null;
  const depositDate = proposal?.deposit?.paid_at ?? null;
  const closedDate = closedEvent?.created_at ?? (deal.pipeline_status.status_code === "CLOSED_WON" ? deal.updated_at : null);

  return apiSuccess({
    deal: {
      deal_id: deal.deal_id,
      deal_code: deal.deal_code,
      title: deal.title,
      pipeline_status: deal.pipeline_status,
    },
    milestones: [
      {
        key: "lead",
        label: "Лид",
        state: "done",
        date: leadDate,
      },
      {
        key: "survey",
        label: "Замер",
        state: surveyDoneAt ? "done" : surveyPlannedAt ? "planned" : "waiting",
        date: surveyDoneAt ?? surveyPlannedAt,
      },
      {
        key: "proposal",
        label: "КП",
        state: proposalDate ? "done" : "waiting",
        date: proposalDate,
      },
      {
        key: "agreement",
        label: "Договор",
        state: agreementDate ? "done" : proposal ? "waiting" : "locked",
        date: agreementDate,
      },
      {
        key: "deposit",
        label: "Аванс",
        state: depositDate ? "done" : proposal ? "waiting" : "locked",
        date: depositDate,
      },
      {
        key: "closed",
        label: "Продажа закрыта",
        state: closedDate ? "done" : agreementDate && depositDate ? "ready" : "locked",
        date: closedDate,
      },
    ],
    project: project
      ? {
          project_id: project.project_id,
          project_code: project.project_code,
          launched_at: project.created_at,
        }
      : null,
  });
}
