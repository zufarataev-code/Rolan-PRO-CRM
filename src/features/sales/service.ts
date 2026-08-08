import { prisma } from "@/lib/db";
import { serializeClient, serializeDealCard, serializeFollowUp, serializeLead, serializeTask } from "@/features/sales/serializers";
import { getAllowedStageTransitions, isValidStageTransition } from "@/features/sales/pipeline";
import { ROLE_CODES } from "@/lib/auth/constants";

function toNumber(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

async function ensureActivePipelineReferenceData() {
  const [approvedStatus, proposalUpdatedStage] = await Promise.all([
    prisma.pipelineStatus.findUnique({
      where: {
        status_code: "APPROVED",
      },
      select: {
        pipeline_status_id: true,
        sort_order: true,
        is_active: true,
      },
    }),
    prisma.pipelineStatus.findUnique({
      where: {
        status_code: "PROPOSAL_UPDATED_BY_CLIENT",
      },
      select: {
        sort_order: true,
      },
    }),
  ]);

  if (
    approvedStatus?.pipeline_status_id &&
    approvedStatus.sort_order === 8 &&
    approvedStatus.is_active &&
    proposalUpdatedStage?.sort_order === 9
  ) {
    return;
  }

  await prisma.pipelineStatus.upsert({
    where: {
      status_code: "APPROVED",
    },
    update: {
      name_ru: "Proposal approved",
      name_en: "Proposal Approved",
      stage_group: "active",
      color_token: "emerald",
      is_closed: false,
      sort_order: 8,
      is_active: true,
    },
    create: {
      status_code: "APPROVED",
      name_ru: "Proposal approved",
      name_en: "Proposal Approved",
      stage_group: "active",
      color_token: "emerald",
      is_closed: false,
      sort_order: 8,
      is_active: true,
    },
  });

  const stageSortUpdates: Array<[string, number]> = [
      ["PROPOSAL_UPDATED_BY_CLIENT", 9],
      ["AGREEMENT_SIGNED", 10],
      ["DEPOSIT_PENDING", 11],
      ["DEPOSIT_PAID", 12],
      ["PROJECT_CREATED", 13],
      ["SCHEDULED", 14],
      ["IN_PROGRESS", 15],
      ["COMPLETED", 16],
      ["FINAL_PAYMENT_PENDING", 17],
      ["PAID", 18],
      ["CLOSED_WON", 19],
      ["CLOSED_LOST", 20],
      ["WARRANTY_SERVICE", 21],
    ];

  await Promise.all(
    stageSortUpdates.map(([statusCode, sortOrder]) =>
      prisma.pipelineStatus.updateMany({
        where: {
          status_code: statusCode,
        },
        data: {
          sort_order: sortOrder,
        },
      }),
    ),
  );
}

export async function getSalesDashboard(managerId?: string) {
  await ensureActivePipelineReferenceData();
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const leadWhere = managerId ? { assigned_manager_id: managerId } : {};
  const dealWhere = managerId ? { assigned_manager_id: managerId } : {};
  const projectWhere = managerId ? { manager_id: managerId } : {};

  const [
    newLeads,
    followUpsToday,
    consultationsToday,
    proposalsPending,
    depositsPending,
    projectsWaitingSchedule,
    projectsInProgress,
    finalPaymentsPending,
    recentActivity,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        ...leadWhere,
        pipeline_status: {
          status_code: "NEW_LEAD",
        },
      },
    }),
    prisma.followUp.count({
      where: {
        ...(managerId ? { assigned_to: managerId } : {}),
        status: "scheduled",
        due_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        ...(managerId ? { assigned_user_id: managerId } : {}),
        event_type: {
          event_code: "CONSULTATION",
        },
        starts_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    }),
    prisma.proposal.count({
      where: {
        status: {
          in: ["draft", "sent", "client_updated", "agreement_signed"],
        },
        deal: dealWhere,
      },
    }),
    prisma.deal.count({
      where: {
        ...dealWhere,
        pipeline_status: {
          status_code: {
            in: ["APPROVED", "DEPOSIT_PENDING"],
          },
        },
      },
    }),
    prisma.deal.count({
      where: {
        ...dealWhere,
        pipeline_status: {
          status_code: "PROJECT_CREATED",
        },
      },
    }),
    prisma.project.count({
      where: {
        ...projectWhere,
        project_status: {
          status_code: "IN_PROGRESS",
        },
      },
    }),
    prisma.deal.count({
      where: {
        ...dealWhere,
        pipeline_status: {
          status_code: "FINAL_PAYMENT_PENDING",
        },
      },
    }),
    prisma.activityLog.findMany({
      where: {
        ...(managerId ? { actor_user_id: managerId } : {}),
        entity_type: {
          in: ["lead", "deal", "follow_up", "task"],
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 8,
    }),
  ]);

  return {
    kpis: {
      new_leads: newLeads,
      follow_ups_today: followUpsToday,
      consultations_today: consultationsToday,
      proposals_pending: proposalsPending,
      deposits_pending: depositsPending,
      projects_waiting_schedule: projectsWaitingSchedule,
      projects_in_progress: projectsInProgress,
      final_payments_pending: finalPaymentsPending,
    },
    recent_activity: recentActivity,
  };
}

export async function getPipelineBoard(managerId?: string) {
  await ensureActivePipelineReferenceData();
  const statuses = await prisma.pipelineStatus.findMany({
    where: {
      is_active: true,
    },
    orderBy: {
      sort_order: "asc",
    },
    include: {
      deals: {
        where: managerId
          ? {
              assigned_manager_id: managerId,
            }
          : undefined,
        include: {
          lead: true,
          client: true,
          pipeline_status: true,
          assigned_manager: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          follow_ups: {
            where: {
              status: "scheduled",
            },
            orderBy: {
              due_at: "asc",
            },
            take: 1,
            include: {
              assigned_to_user: {
                select: {
                  user_id: true,
                  full_name: true,
                },
              },
            },
          },
          tasks: {
            include: {
              assigned_to_user: {
                select: {
                  user_id: true,
                  full_name: true,
                },
              },
              created_by_user: {
                select: {
                  user_id: true,
                  full_name: true,
                },
              },
            },
          },
          projects: true,
          _count: {
            select: {
              follow_ups: true,
              tasks: true,
              projects: true,
            },
          },
        },
        orderBy: {
          updated_at: "desc",
        },
      },
    },
  });

  return statuses.map((status) => ({
    pipeline_status_id: status.pipeline_status_id,
    status_code: status.status_code,
    name_ru: status.name_ru,
    name_en: status.name_en,
    color_token: status.color_token,
    stage_group: status.stage_group,
    deals: status.deals.map(serializeDealCard),
  }));
}

export async function getPipelineStagesWithTransitions() {
  await ensureActivePipelineReferenceData();
  const statuses = await prisma.pipelineStatus.findMany({
    where: {
      is_active: true,
    },
    orderBy: {
      sort_order: "asc",
    },
  });

  return statuses.map((status) => ({
    pipeline_status_id: status.pipeline_status_id,
    status_code: status.status_code,
    name_ru: status.name_ru,
    name_en: status.name_en,
    stage_group: status.stage_group,
    color_token: status.color_token,
    is_closed: status.is_closed,
    sort_order: status.sort_order,
    allowed_next: getAllowedStageTransitions(status.status_code),
  }));
}

export async function getDealCardById(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: {
      deal_id: dealId,
    },
    include: {
      lead: true,
      client: true,
      pipeline_status: true,
      assigned_manager: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
      follow_ups: {
        include: {
          assigned_to_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
      },
      tasks: {
        include: {
          assigned_to_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          created_by_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
      },
      projects: true,
      _count: {
        select: {
          follow_ups: true,
          tasks: true,
          projects: true,
        },
      },
    },
  });

  if (!deal) {
    return null;
  }

  const [activity, latestConsultation, latestProposal, latestProject] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        entity_type: "deal",
        entity_id: dealId,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 8,
    }),
    prisma.consultation.findFirst({
      where: {
        deal_id: dealId,
      },
      orderBy: [{ scheduled_start_at: "desc" }, { created_at: "desc" }],
      include: {
        assigned_consultant: {
          select: {
            user_id: true,
            full_name: true,
          },
        },
        survey: {
          select: {
            survey_id: true,
            status: true,
            completed_at: true,
            _count: {
              select: {
                measurements: true,
                recommendations: true,
                attachments_files: true,
              },
            },
          },
        },
      },
    }),
    prisma.proposal.findFirst({
      where: {
        deal_id: dealId,
      },
      orderBy: {
        created_at: "desc",
      },
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
            amount: true,
            status: true,
            paid_at: true,
          },
        },
        project: {
          select: {
            project_id: true,
            project_code: true,
            title: true,
          },
        },
      },
    }),
    prisma.project.findFirst({
      where: {
        deal_id: dealId,
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        project_status: {
          select: {
            status_code: true,
            name_ru: true,
            color_token: true,
          },
        },
      },
    }),
  ]);

  return {
    ...serializeDealCard(deal),
    activity,
    workflow: {
      latest_consultation: latestConsultation
        ? {
            consultation_id: latestConsultation.consultation_id,
            title: latestConsultation.title,
            status: latestConsultation.status,
            location_address: latestConsultation.location_address,
            manager_notes: latestConsultation.manager_notes,
            scheduled_start_at: latestConsultation.scheduled_start_at,
            scheduled_end_at: latestConsultation.scheduled_end_at,
            assigned_consultant: latestConsultation.assigned_consultant,
            survey: latestConsultation.survey
              ? {
                  survey_id: latestConsultation.survey.survey_id,
                  status: latestConsultation.survey.status,
                  completed_at: latestConsultation.survey.completed_at,
                  counts: {
                    measurements: latestConsultation.survey._count.measurements,
                    recommendations: latestConsultation.survey._count.recommendations,
                    files: latestConsultation.survey._count.attachments_files,
                  },
                }
              : null,
          }
        : null,
      latest_proposal: latestProposal
        ? {
            proposal_id: latestProposal.proposal_id,
            title: latestProposal.title,
            status: latestProposal.status,
            survey_id: latestProposal.survey_id,
            selected_total_amount: toNumber(latestProposal.selected_total_amount),
            subtotal_amount: toNumber(latestProposal.subtotal_amount),
            currency: latestProposal.currency,
            sent_at: latestProposal.sent_at,
            agreement: latestProposal.agreement,
            deposit: latestProposal.deposit
              ? {
                  deposit_id: latestProposal.deposit.deposit_id,
                  amount: toNumber(latestProposal.deposit.amount),
                  status: latestProposal.deposit.status,
                  paid_at: latestProposal.deposit.paid_at,
                }
              : null,
            project: latestProposal.project,
          }
        : null,
      latest_project: latestProject
        ? {
            project_id: latestProject.project_id,
            project_code: latestProject.project_code,
            title: latestProject.title,
            install_date: latestProject.install_date,
            created_at: latestProject.created_at,
            project_status: latestProject.project_status,
          }
        : null,
    },
  };
}

export async function listConsultantOptions() {
  const consultants = await prisma.user.findMany({
    where: {
      is_active: true,
      user_accesses: {
        some: {
          is_active: true,
          role: {
            code: ROLE_CODES.CONSULTANT,
          },
        },
      },
    },
    orderBy: {
      full_name: "asc",
    },
    select: {
      user_id: true,
      full_name: true,
    },
  });

  return consultants;
}

export async function listLeads(managerId?: string) {
  const leads = await prisma.lead.findMany({
    where: managerId
      ? {
          assigned_manager_id: managerId,
        }
      : undefined,
    include: {
      pipeline_status: true,
      city: {
        select: {
          name_ru: true,
          name_en: true,
        },
      },
      assigned_manager: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return leads.map(serializeLead);
}

export async function listClients() {
  const clients = await prisma.client.findMany({
    include: {
      city: {
        select: {
          name_ru: true,
          name_en: true,
        },
      },
      _count: {
        select: {
          deals: true,
          projects: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return clients.map(serializeClient);
}

export async function listDeals(managerId?: string) {
  const deals = await prisma.deal.findMany({
    where: managerId
      ? {
          assigned_manager_id: managerId,
        }
      : undefined,
    include: {
      lead: true,
      client: true,
      pipeline_status: true,
      assigned_manager: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
      follow_ups: {
        where: {
          status: "scheduled",
        },
        include: {
          assigned_to_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
      },
      tasks: {
        include: {
          assigned_to_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          created_by_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
      },
      projects: true,
      _count: {
        select: {
          follow_ups: true,
          tasks: true,
          projects: true,
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
  });

  return deals.map(serializeDealCard);
}

export async function listFollowUps(managerId?: string) {
  const followUps = await prisma.followUp.findMany({
    where: managerId
      ? {
          assigned_to: managerId,
        }
      : undefined,
    include: {
      assigned_to_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
      created_by_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
    },
    orderBy: {
      due_at: "asc",
    },
  });

  return followUps.map(serializeFollowUp);
}

export async function listTasks(managerId?: string) {
  const tasks = await prisma.task.findMany({
    where: managerId
      ? {
          assigned_to: managerId,
        }
      : undefined,
    include: {
      assigned_to_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
      created_by_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return tasks.map(serializeTask);
}

type MoveDealStageInput = {
  dealId: string;
  nextStatusCode: string;
  actorUserId: string;
  managerScopeId?: string;
  nextAction?: {
    typeKey: string;
    dueAt: Date;
    notes?: string | null;
  } | null;
};

export async function moveDealStage(input: MoveDealStageInput) {
  const deal = await prisma.deal.findUnique({
    where: {
      deal_id: input.dealId,
    },
    include: {
      pipeline_status: true,
    },
  });

  if (!deal) {
    return {
      ok: false as const,
      code: "not_found",
    };
  }

  if (input.managerScopeId && deal.assigned_manager_id !== input.managerScopeId) {
    return {
      ok: false as const,
      code: "forbidden",
    };
  }

  if (!isValidStageTransition(deal.pipeline_status.status_code, input.nextStatusCode)) {
    return {
      ok: false as const,
      code: "invalid_transition",
      allowed: getAllowedStageTransitions(deal.pipeline_status.status_code),
    };
  }

  const nextStatus = await prisma.pipelineStatus.findUnique({
    where: {
      status_code: input.nextStatusCode,
    },
  });

  if (!nextStatus) {
    return {
      ok: false as const,
      code: "status_not_found",
    };
  }

  if (input.nextAction && input.nextAction.dueAt.getTime() <= Date.now()) {
    return {
      ok: false as const,
      code: "invalid_next_action_date",
    };
  }

  const isTerminalStage = nextStatus.is_closed || getAllowedStageTransitions(nextStatus.status_code).length === 0;
  const existingFutureAction = isTerminalStage
    ? null
    : await prisma.followUp.findFirst({
        where: {
          deal_id: deal.deal_id,
          status: "scheduled",
          due_at: {
            gt: new Date(),
          },
        },
        select: {
          follow_up_id: true,
        },
      });

  if (!isTerminalStage && !input.nextAction && !existingFutureAction) {
    return {
      ok: false as const,
      code: "next_action_required",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: {
        deal_id: deal.deal_id,
      },
      data: {
        pipeline_status_id: nextStatus.pipeline_status_id,
      },
    });

    if (deal.lead_id) {
      await tx.lead.updateMany({
        where: {
          lead_id: deal.lead_id,
        },
        data: {
          pipeline_status_id: nextStatus.pipeline_status_id,
        },
      });
    }

    if (!isTerminalStage && input.nextAction) {
      const followUp = await tx.followUp.create({
        data: {
          deal_id: deal.deal_id,
          lead_id: deal.lead_id,
          type_key: input.nextAction.typeKey,
          status: "scheduled",
          due_at: input.nextAction.dueAt,
          notes: input.nextAction.notes?.trim() || null,
          assigned_to: deal.assigned_manager_id ?? input.actorUserId,
          created_by: input.actorUserId,
        },
      });

      await tx.activityLog.create({
        data: {
          actor_user_id: input.actorUserId,
          entity_type: "follow_up",
          entity_id: followUp.follow_up_id,
          action_key: "follow_up.created_with_stage_move",
          message: `Следующее действие назначено: ${input.nextAction.typeKey}.`,
          metadata: {
            deal_id: deal.deal_id,
            due_at: input.nextAction.dueAt.toISOString(),
          },
        },
      });
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: input.actorUserId,
        entity_type: "deal",
        entity_id: deal.deal_id,
        action_key: "pipeline.manual_stage_change",
        message: `Сделка переведена из ${deal.pipeline_status.status_code} в ${nextStatus.status_code}.`,
        metadata: {
          old_status: deal.pipeline_status.status_code,
          new_status: nextStatus.status_code,
        },
      },
    });
  });

  const updated = await getDealCardById(deal.deal_id);

  if (!updated) {
    return {
      ok: false as const,
      code: "not_found",
    };
  }

  return {
    ok: true as const,
    deal: updated,
    allowed_next: getAllowedStageTransitions(updated.pipeline_status.status_code),
  };
}
