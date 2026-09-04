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
  if ("proposalId" in input) {
    return { proposal_id: input.proposalId };
  }

  if ("accessToken" in input) {
    return { access_token: input.accessToken };
  }

  return {
    deposit: {
      deposit_id: input.depositId,
    },
  };
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

/**
 * Closes the sales deal only when BOTH commercial gates are complete:
 * signed agreement + paid deposit. Operational Project creation is deliberately
 * not done here; the manager launches it explicitly afterwards.
 */
export async function closeSaleIfReady(input: CloseSaleInput) {
  const proposal = await prisma.proposal.findFirst({
    where: proposalWhere(input),
    include: {
      agreement: {
        select: {
          status: true,
          signed_at: true,
        },
      },
      deposit: {
        select: {
          deposit_id: true,
          status: true,
          paid_at: true,
        },
      },
      project: {
        select: {
          project_id: true,
        },
      },
      deal: {
        include: {
          pipeline_status: {
            select: {
              status_code: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  const ready = isSaleCloseReady({
    agreementStatus: proposal.agreement?.status,
    agreementSignedAt: proposal.agreement?.signed_at,
    depositStatus: proposal.deposit?.status,
    depositPaidAt: proposal.deposit?.paid_at,
  });

  if (!ready) {
    return {
      proposal_id: proposal.proposal_id,
      deal_id: proposal.deal_id,
      ready: false,
      closed: proposal.deal.pipeline_status.status_code === "CLOSED_WON",
      project_id: proposal.project?.project_id ?? null,
      agreement_signed: proposal.agreement?.status === "signed" && Boolean(proposal.agreement?.signed_at),
      deposit_paid: proposal.deposit?.status === "paid" && Boolean(proposal.deposit?.paid_at),
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
        type_key: {
          in: ["proposal_review_call", "deposit_reminder"],
        },
      },
      data: {
        status: "completed",
        completed_at: new Date(),
        outcome: "sale_closed_won",
      },
    });

    // Remove the obsolete pre-launch wording produced by older flows.
    await tx.task.updateMany({
      where: {
        deal_id: proposal.deal_id,
        status: { in: ["open", "in_progress"] },
        title: "Создать project",
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
