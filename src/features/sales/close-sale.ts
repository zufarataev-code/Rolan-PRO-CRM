import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type SaleGateLookup =
  | { proposalId: string }
  | { accessToken: string }
  | { depositId: string };

type CloseSaleInput = SaleGateLookup & {
  actorUserId?: string | null;
};

function proposalWhere(input: SaleGateLookup): Prisma.ProposalWhereInput {
  if ("proposalId" in input) return { proposal_id: input.proposalId };
  if ("accessToken" in input) return { access_token: input.accessToken };
  return { deposit: { deposit_id: input.depositId } };
}

export function isSaleCloseReady(input: {
  agreementStatus?: string | null;
  agreementSignedAt?: Date | null;
  depositStatus?: string | null;
  depositPaidAt?: Date | null;
}) {
  return (
    input.agreementStatus === "signed" &&
    Boolean(input.agreementSignedAt) &&
    input.depositStatus === "paid" &&
    Boolean(input.depositPaidAt)
  );
}

async function reconcileIncompleteSale(input: {
  proposalId: string;
  dealId: string;
  managerUserId?: string | null;
  actorUserId?: string | null;
  agreementSigned: boolean;
  depositPaid: boolean;
}) {
  const actorUserId = input.actorUserId ?? input.managerUserId ?? null;

  await prisma.$transaction(async (tx) => {
    // Old flow created this task immediately after a deposit. It must never be
    // actionable until both sales gates are complete.
    await tx.task.updateMany({
      where: {
        deal_id: input.dealId,
        title: "Создать project",
        status: { in: ["open", "in_progress"] },
      },
      data: {
        status: "done",
        completed_at: new Date(),
      },
    });

    if (!input.managerUserId || !actorUserId) return;

    const title = !input.agreementSigned
      ? "Получить подпись договора"
      : !input.depositPaid
        ? "Получить аванс"
        : null;

    if (!title) return;

    const existing = await tx.task.findFirst({
      where: {
        deal_id: input.dealId,
        entity_type: "proposal",
        entity_id: input.proposalId,
        title,
        status: { in: ["open", "in_progress"] },
      },
      select: { task_id: true },
    });

    if (!existing) {
      await tx.task.create({
        data: {
          deal_id: input.dealId,
          entity_type: "proposal",
          entity_id: input.proposalId,
          title,
          description: !input.agreementSigned
            ? "Аванс уже получен, но договор ещё не подписан. Продолжайте сопровождение клиента — проект запускать нельзя."
            : "Договор подписан, но аванс ещё не получен. Продолжайте сопровождение клиента — проект запускать нельзя.",
          priority: "high",
          assigned_to: input.managerUserId,
          created_by: actorUserId,
          due_at: new Date(),
        },
      });
    }
  });
}

/**
 * Closes the sales deal only when BOTH commercial gates are complete:
 * signed agreement + paid deposit. Operational Project creation is deliberately
 * not done here; the manager launches it explicitly afterwards.
 */
export async function closeSaleIfReady(input: CloseSaleInput) {
  const proposal = await prisma.proposal.findFirst({
    where: proposalWhere(input),
    include: {
      agreement: { select: { status: true, signed_at: true } },
      deposit: { select: { deposit_id: true, status: true, paid_at: true } },
      project: { select: { project_id: true } },
      deal: {
        include: {
          pipeline_status: { select: { status_code: true } },
        },
      },
    },
  });

  if (!proposal) return null;

  const agreementSigned = proposal.agreement?.status === "signed" && Boolean(proposal.agreement?.signed_at);
  const depositPaid = proposal.deposit?.status === "paid" && Boolean(proposal.deposit?.paid_at);
  const ready = isSaleCloseReady({
    agreementStatus: proposal.agreement?.status,
    agreementSignedAt: proposal.agreement?.signed_at,
    depositStatus: proposal.deposit?.status,
    depositPaidAt: proposal.deposit?.paid_at,
  });

  if (!ready) {
    await reconcileIncompleteSale({
      proposalId: proposal.proposal_id,
      dealId: proposal.deal_id,
      managerUserId: proposal.deal.assigned_manager_id,
      actorUserId: input.actorUserId,
      agreementSigned,
      depositPaid,
    });

    return {
      proposal_id: proposal.proposal_id,
      deal_id: proposal.deal_id,
      ready: false,
      closed: proposal.deal.pipeline_status.status_code === "CLOSED_WON",
      project_id: proposal.project?.project_id ?? null,
      agreement_signed: agreementSigned,
      deposit_paid: depositPaid,
    };
  }

  const closedWonStatus = await prisma.pipelineStatus.findUnique({
    where: { status_code: "CLOSED_WON" },
    select: { pipeline_status_id: true },
  });

  if (!closedWonStatus) {
    throw new Error("CLOSED_WON pipeline status is not configured.");
  }

  const actorUserId = input.actorUserId ?? proposal.deal.assigned_manager_id ?? null;
  const alreadyClosed = proposal.deal.pipeline_status.status_code === "CLOSED_WON";

  await prisma.$transaction(async (tx) => {
    if (!alreadyClosed) {
      await tx.deal.update({
        where: { deal_id: proposal.deal_id },
        data: { pipeline_status_id: closedWonStatus.pipeline_status_id },
      });

      if (proposal.deal.lead_id) {
        await tx.lead.update({
          where: { lead_id: proposal.deal.lead_id },
          data: { pipeline_status_id: closedWonStatus.pipeline_status_id },
        });
      }

      await tx.activityLog.create({
        data: {
          actor_user_id: actorUserId,
          entity_type: "deal",
          entity_id: proposal.deal_id,
          action_key: "sales.closed_won",
          message: "Сделка закрыта успешно: договор подписан и аванс оплачен.",
          metadata: {
            proposal_id: proposal.proposal_id,
            deposit_id: proposal.deposit?.deposit_id ?? null,
            agreement_signed: true,
            deposit_paid: true,
          },
        },
      });
    }

    await tx.followUp.updateMany({
      where: {
        deal_id: proposal.deal_id,
        status: "scheduled",
        type_key: { in: ["proposal_review_call", "deposit_reminder"] },
      },
      data: {
        status: "completed",
        completed_at: new Date(),
        outcome: "sale_closed_won",
      },
    });

    await tx.task.updateMany({
      where: {
        deal_id: proposal.deal_id,
        status: { in: ["open", "in_progress"] },
        title: { in: ["Создать project", "Получить подпись договора", "Получить аванс"] },
      },
      data: {
        status: "done",
        completed_at: new Date(),
      },
    });

    if (!proposal.project && proposal.deal.assigned_manager_id && actorUserId) {
      const existingLaunchTask = await tx.task.findFirst({
        where: {
          deal_id: proposal.deal_id,
          entity_type: "proposal",
          entity_id: proposal.proposal_id,
          title: "Запустить проект",
          status: { in: ["open", "in_progress"] },
        },
        select: { task_id: true },
      });

      if (!existingLaunchTask) {
        await tx.task.create({
          data: {
            deal_id: proposal.deal_id,
            entity_type: "proposal",
            entity_id: proposal.proposal_id,
            title: "Запустить проект",
            description: "Продажа закрыта: договор подписан и аванс оплачен. Проверьте состав работ и запустите операционный проект.",
            priority: "high",
            assigned_to: proposal.deal.assigned_manager_id,
            created_by: actorUserId,
            due_at: new Date(),
          },
        });
      }

      const existingNotification = await tx.notification.findFirst({
        where: {
          recipient_user_id: proposal.deal.assigned_manager_id,
          entity_type: "proposal",
          entity_id: proposal.proposal_id,
          type_key: "project.ready_to_launch",
          is_read: false,
        },
        select: { notification_id: true },
      });

      if (!existingNotification) {
        await tx.notification.create({
          data: {
            recipient_user_id: proposal.deal.assigned_manager_id,
            actor_user_id: actorUserId,
            entity_type: "proposal",
            entity_id: proposal.proposal_id,
            type_key: "project.ready_to_launch",
            title: "Можно запускать проект",
            message: "Договор подписан и аванс оплачен. Сделка закрыта успешно — проект готов к запуску.",
          },
        });
      }
    }
  });

  return {
    proposal_id: proposal.proposal_id,
    deal_id: proposal.deal_id,
    ready: true,
    closed: true,
    project_id: proposal.project?.project_id ?? null,
    agreement_signed: true,
    deposit_paid: true,
  };
}
