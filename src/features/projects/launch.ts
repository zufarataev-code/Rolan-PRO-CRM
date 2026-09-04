import { Prisma } from "@prisma/client";

import { PROPOSAL_STATUSES } from "@/features/proposals/api";
import { closeSaleIfReady } from "@/features/sales/close-sale";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type ProjectLaunchSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

function isOwner(session: ProjectLaunchSession) {
  return session.roles.includes(ROLE_CODES.OWNER);
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function buildPositionFields(item: {
  proposal_item_id: string;
  item_kind: string;
  measurement_id: string | null;
  measurement_snapshot: Prisma.JsonValue | null;
  dynamic_fields: Prisma.JsonValue | null;
  addons_snapshot: Prisma.JsonValue | null;
  line_price: Prisma.Decimal;
}) {
  return {
    ...asObject(item.measurement_snapshot),
    ...asObject(item.dynamic_fields),
    proposal_item_id: item.proposal_item_id,
    item_kind: item.item_kind,
    source_measurement_id: item.measurement_id,
    client_price: Number(item.line_price.toString()),
    addons_snapshot: Array.isArray(item.addons_snapshot) ? item.addons_snapshot : [],
    measurement_snapshot: item.measurement_snapshot ?? null,
  } as Prisma.InputJsonValue;
}

function makeProjectCode() {
  const timePart = Date.now().toString().slice(-8);
  const randomPart = Math.floor(Math.random() * 900 + 100);
  return `PRJ-${timePart}-${randomPart}`;
}

export async function launchProjectFromClosedSale(
  session: ProjectLaunchSession,
  input: { proposal_id: string },
) {
  // Reconcile the sales gate first. This is idempotent and also supports old
  // records where signing/payment happened before this lifecycle was released.
  const sale = await closeSaleIfReady({
    proposalId: input.proposal_id,
    actorUserId: session.user.user_id,
  });

  const proposal = await prisma.proposal.findFirst({
    where: {
      proposal_id: input.proposal_id,
      ...(isOwner(session)
        ? {}
        : {
            OR: [{ created_by: session.user.user_id }, { deal: { assigned_manager_id: session.user.user_id } }],
          }),
    },
    include: {
      client: true,
      agreement: true,
      deposit: true,
      deal: {
        include: {
          pipeline_status: {
            select: { status_code: true },
          },
        },
      },
      project: {
        select: {
          project_id: true,
          project_code: true,
          title: true,
        },
      },
      proposal_items: {
        where: { client_selected: true },
        orderBy: { sort_order: "asc" },
        select: {
          proposal_item_id: true,
          measurement_id: true,
          service_type_id: true,
          film_id: true,
          item_kind: true,
          title_ru: true,
          description_ru: true,
          measurement_snapshot: true,
          dynamic_fields: true,
          addons_snapshot: true,
          line_price: true,
          sort_order: true,
        },
      },
    },
  });

  if (!proposal) return null;
  if (proposal.project) return proposal.project;

  const agreementSigned = proposal.agreement?.status === "signed" && Boolean(proposal.agreement.signed_at);
  if (!agreementSigned) {
    return "agreement_not_signed" as const;
  }

  const depositPaid = proposal.deposit?.status === "paid" && Boolean(proposal.deposit.paid_at);
  if (!depositPaid) {
    return "deposit_not_paid" as const;
  }

  if (!sale?.ready || proposal.deal.pipeline_status.status_code !== "CLOSED_WON") {
    // The query above may have been read before closeSaleIfReady committed its
    // update. Re-check the canonical status rather than allowing a bypass.
    const refreshedDeal = await prisma.deal.findUnique({
      where: { deal_id: proposal.deal_id },
      include: { pipeline_status: { select: { status_code: true } } },
    });
    if (refreshedDeal?.pipeline_status.status_code !== "CLOSED_WON") {
      return "sale_not_closed" as const;
    }
  }

  if (![PROPOSAL_STATUSES.APPROVED, PROPOSAL_STATUSES.AGREEMENT_SIGNED].includes(proposal.status as never)) {
    return "proposal_not_approved" as const;
  }

  if (proposal.proposal_items.length === 0) {
    return "missing_selection" as const;
  }

  const [projectStatus, paymentStatus, positionStatus] = await Promise.all([
    prisma.projectStatus.findUnique({ where: { status_code: "NEW" } }),
    prisma.paymentStatus.findUnique({ where: { status_code: "DEPOSIT_PAID" } }),
    prisma.positionStatus.findUnique({ where: { status_code: "READY" } }),
  ]);

  if (!projectStatus || !paymentStatus || !positionStatus) {
    return "missing_status_config" as const;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({
        where: { proposal_id: proposal.proposal_id },
        select: { project_id: true, project_code: true, title: true },
      });
      if (existing) return existing;

      const created = await tx.project.create({
        data: {
          project_code: makeProjectCode(),
          client_id: proposal.client_id,
          deal_id: proposal.deal_id,
          proposal_id: proposal.proposal_id,
          manager_id: proposal.deal.assigned_manager_id ?? session.user.user_id,
          project_status_id: projectStatus.project_status_id,
          payment_status_id: paymentStatus.payment_status_id,
          city_id: proposal.client.city_id ?? null,
          title: proposal.title,
          address: proposal.client.service_address ?? proposal.client.billing_address ?? null,
          zip_code: proposal.client.zip_code ?? null,
          priority: "normal",
        },
        select: {
          project_id: true,
          project_code: true,
          title: true,
        },
      });

      for (const item of proposal.proposal_items) {
        await tx.projectPosition.create({
          data: {
            project_id: created.project_id,
            proposal_item_id: item.proposal_item_id,
            service_type_id: item.service_type_id,
            film_id: item.film_id,
            position_status_id: positionStatus.position_status_id,
            title: item.title_ru,
            dynamic_fields: buildPositionFields(item),
            pricing_source: "proposal",
            base_price: item.line_price,
            min_price: 0,
            actual_price: item.line_price,
            notes: item.description_ru ?? null,
            sort_order: item.sort_order,
          },
        });
      }

      await tx.task.updateMany({
        where: {
          deal_id: proposal.deal_id,
          entity_type: "proposal",
          entity_id: proposal.proposal_id,
          title: "Запустить проект",
          status: { in: ["open", "in_progress"] },
        },
        data: {
          status: "done",
          completed_at: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          actor_user_id: session.user.user_id,
          entity_type: "project",
          entity_id: created.project_id,
          project_id: created.project_id,
          action_key: "project.launched",
          message: `Проект ${created.project_code} запущен после закрытия продажи.`,
          metadata: {
            proposal_id: proposal.proposal_id,
            deal_id: proposal.deal_id,
            agreement_signed: true,
            deposit_paid: true,
            proposal_items_count: proposal.proposal_items.length,
          },
        },
      });

      await tx.proposalEvent.create({
        data: {
          proposal_id: proposal.proposal_id,
          actor_user_id: session.user.user_id,
          actor_type: "manager",
          event_key: "project.launched",
          message: "Менеджер запустил операционный проект после подписанного договора и оплаченного аванса.",
          metadata: {
            project_id: created.project_id,
            project_code: created.project_code,
          },
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.project.findUnique({
        where: { proposal_id: proposal.proposal_id },
        select: { project_id: true, project_code: true, title: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}
