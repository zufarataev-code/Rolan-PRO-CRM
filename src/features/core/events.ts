import { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

const PIPELINE_STAGE_ALIASES: Record<string, string[]> = {
  LEAD: ["LEAD", "NEW_LEAD"],
  APPROVED: ["APPROVED", "DEPOSIT_PENDING"],
};

async function resolvePipelineStatus(tx: DbClient, statusCode: string) {
  const candidateCodes = PIPELINE_STAGE_ALIASES[statusCode] ?? [statusCode];

  for (const candidateCode of candidateCodes) {
    if (candidateCode === "APPROVED") {
      await tx.pipelineStatus.upsert({
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
    }

    const status = await tx.pipelineStatus.findUnique({
      where: {
        status_code: candidateCode,
      },
      select: {
        pipeline_status_id: true,
        status_code: true,
      },
    });

    if (status) {
      return status;
    }
  }

  return null;
}

async function logPipelineTransition(
  tx: DbClient,
  input: {
    actorUserId?: string | null;
    entityType: "lead" | "deal";
    entityId: string;
    eventKey: string;
    oldStatus: string;
    newStatus: string;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  if (input.oldStatus === input.newStatus) {
    return;
  }

  await tx.activityLog.create({
    data: {
      actor_user_id: input.actorUserId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action_key: `pipeline.${input.eventKey}`,
      message: `${input.entityType === "deal" ? "Сделка" : "Лид"} переведена из ${input.oldStatus} в ${input.newStatus}.`,
      metadata: {
        old_status: input.oldStatus,
        new_status: input.newStatus,
        event_key: input.eventKey,
        ...(input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, unknown>) : {}),
      },
    },
  });
}

async function syncPipelineStage(
  tx: DbClient,
  input: {
    actorUserId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
    nextStatusCode: string;
    eventKey: string;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  const nextStatus = await resolvePipelineStatus(tx, input.nextStatusCode);

  if (!nextStatus) {
    return null;
  }

  if (input.leadId) {
    const lead = await tx.lead.findUnique({
      where: {
        lead_id: input.leadId,
      },
      include: {
        pipeline_status: {
          select: {
            status_code: true,
          },
        },
      },
    });

    if (lead && lead.pipeline_status.status_code !== nextStatus.status_code) {
      await tx.lead.update({
        where: {
          lead_id: lead.lead_id,
        },
        data: {
          pipeline_status_id: nextStatus.pipeline_status_id,
        },
      });

      await logPipelineTransition(tx, {
        actorUserId: input.actorUserId,
        entityType: "lead",
        entityId: lead.lead_id,
        oldStatus: lead.pipeline_status.status_code,
        newStatus: nextStatus.status_code,
        eventKey: input.eventKey,
        metadata: input.metadata ?? null,
      });
    }
  }

  if (input.dealId) {
    const deal = await tx.deal.findUnique({
      where: {
        deal_id: input.dealId,
      },
      include: {
        pipeline_status: {
          select: {
            status_code: true,
          },
        },
      },
    });

    if (deal && deal.pipeline_status.status_code !== nextStatus.status_code) {
      await tx.deal.update({
        where: {
          deal_id: deal.deal_id,
        },
        data: {
          pipeline_status_id: nextStatus.pipeline_status_id,
        },
      });

      await logPipelineTransition(tx, {
        actorUserId: input.actorUserId,
        entityType: "deal",
        entityId: deal.deal_id,
        oldStatus: deal.pipeline_status.status_code,
        newStatus: nextStatus.status_code,
        eventKey: input.eventKey,
        metadata: input.metadata ?? null,
      });
    }
  }

  return nextStatus.status_code;
}

async function ensureNotification(
  tx: DbClient,
  input: {
    recipientUserId?: string | null;
    actorUserId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    typeKey: string;
    title: string;
    message: string;
    dedupe?: boolean;
  },
) {
  if (!input.recipientUserId) {
    return null;
  }

  if (input.dedupe !== false) {
    const existing = await tx.notification.findFirst({
      where: {
        recipient_user_id: input.recipientUserId,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        type_key: input.typeKey,
        is_read: false,
      },
      select: {
        notification_id: true,
      },
    });

    if (existing) {
      return existing;
    }
  }

  return tx.notification.create({
    data: {
      recipient_user_id: input.recipientUserId,
      actor_user_id: input.actorUserId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      type_key: input.typeKey,
      title: input.title,
      message: input.message,
    },
  });
}

async function ensureTask(
  tx: DbClient,
  input: {
    leadId?: string | null;
    dealId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    title: string;
    description?: string | null;
    assignedTo?: string | null;
    createdBy?: string | null;
    dueAt?: Date | null;
    priority?: string;
  },
) {
  if (!input.createdBy) {
    return null;
  }

  const existing = await tx.task.findFirst({
    where: {
      ...(input.leadId ? { lead_id: input.leadId } : {}),
      ...(input.dealId ? { deal_id: input.dealId } : {}),
      ...(input.entityType ? { entity_type: input.entityType } : {}),
      ...(input.entityId ? { entity_id: input.entityId } : {}),
      title: input.title,
      ...(input.assignedTo ? { assigned_to: input.assignedTo } : {}),
      status: {
        in: ["open", "in_progress"],
      },
    },
    select: {
      task_id: true,
    },
  });

  if (existing) {
    return existing;
  }

  return tx.task.create({
    data: {
      lead_id: input.leadId ?? null,
      deal_id: input.dealId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assignedTo ?? null,
      created_by: input.createdBy,
      due_at: input.dueAt ?? null,
      priority: input.priority ?? "normal",
    },
  });
}

async function ensureFollowUp(
  tx: DbClient,
  input: {
    leadId?: string | null;
    dealId?: string | null;
    typeKey: string;
    notes?: string | null;
    assignedTo?: string | null;
    createdBy?: string | null;
    dueAt: Date;
  },
) {
  if (!input.createdBy) {
    return null;
  }

  const existing = await tx.followUp.findFirst({
    where: {
      ...(input.leadId ? { lead_id: input.leadId } : {}),
      ...(input.dealId ? { deal_id: input.dealId } : {}),
      type_key: input.typeKey,
      ...(input.assignedTo ? { assigned_to: input.assignedTo } : {}),
      status: "scheduled",
    },
    select: {
      follow_up_id: true,
    },
  });

  if (existing) {
    return existing;
  }

  return tx.followUp.create({
    data: {
      lead_id: input.leadId ?? null,
      deal_id: input.dealId ?? null,
      type_key: input.typeKey,
      notes: input.notes ?? null,
      assigned_to: input.assignedTo ?? null,
      created_by: input.createdBy,
      due_at: input.dueAt,
      status: "scheduled",
    },
  });
}

async function completeMatchingTasks(
  tx: DbClient,
  input: {
    dealId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    title: string;
  },
) {
  const now = new Date();
  await tx.task.updateMany({
    where: {
      deal_id: input.dealId ?? undefined,
      entity_type: input.entityType ?? undefined,
      entity_id: input.entityId ?? undefined,
      title: input.title,
      status: {
        in: ["open", "in_progress"],
      },
    },
    data: {
      status: "done",
      completed_at: now,
    },
  });
}

async function completeMatchingFollowUps(
  tx: DbClient,
  input: {
    dealId?: string | null;
    leadId?: string | null;
    typeKey: string;
    outcome: string;
  },
) {
  const now = new Date();
  await tx.followUp.updateMany({
    where: {
      deal_id: input.dealId ?? undefined,
      lead_id: input.leadId ?? undefined,
      type_key: input.typeKey,
      status: "scheduled",
    },
    data: {
      status: "completed",
      completed_at: now,
      outcome: input.outcome,
    },
  });
}

export async function onLeadCreated(
  tx: DbClient,
  input: {
    actorUserId: string;
    leadId?: string | null;
    dealId?: string | null;
    managerUserId?: string | null;
    leadNameOrTitle: string;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId ?? null,
    nextStatusCode: "LEAD",
    eventKey: "lead.created",
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: input.dealId ? "deal" : "lead",
    entityId: input.dealId ?? input.leadId ?? null,
    typeKey: "lead.created",
    title: "Новый лид",
    message: `${input.leadNameOrTitle} добавлен в pipeline.`,
  });
}

export async function onConsultationScheduled(
  tx: DbClient,
  input: {
    actorUserId: string;
    consultationId: string;
    consultationTitle: string;
    leadId?: string | null;
    dealId?: string | null;
    consultantUserId?: string | null;
    scheduledStartAt: Date;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId ?? null,
    nextStatusCode: "CONSULTATION_SCHEDULED",
    eventKey: "consultation.scheduled",
    metadata: {
      consultation_id: input.consultationId,
    },
  });

  await ensureNotification(tx, {
    recipientUserId: input.consultantUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "consultation",
    entityId: input.consultationId,
    typeKey: "consultation.assigned",
    title: "Назначена консультация",
    message: `${input.consultationTitle} назначена на ${input.scheduledStartAt.toLocaleString("ru-RU")}.`,
    dedupe: false,
  });
}

export async function onSurveyCompleted(
  tx: DbClient,
  input: {
    actorUserId: string;
    consultationId: string;
    surveyId: string;
    leadId?: string | null;
    dealId?: string | null;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId ?? null,
    nextStatusCode: "SURVEY_COMPLETED",
    eventKey: "survey.completed",
    metadata: {
      consultation_id: input.consultationId,
      survey_id: input.surveyId,
    },
  });

  await ensureTask(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId ?? null,
    entityType: "survey",
    entityId: input.surveyId,
    title: "Сделать proposal",
    description: "Survey завершен. Нужно собрать и отправить proposal клиенту.",
    assignedTo: input.managerUserId ?? null,
    createdBy: input.actorUserId,
    dueAt: addHours(new Date(), 24),
    priority: "high",
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "survey",
    entityId: input.surveyId,
    typeKey: "survey.completed",
    title: "Survey completed",
    message: "Консультант завершил survey. Можно собирать proposal.",
  });
}

export async function onProposalSent(
  tx: DbClient,
  input: {
    actorUserId: string;
    proposalId: string;
    leadId?: string | null;
    dealId: string;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "PROPOSAL_SENT",
    eventKey: "proposal.sent",
    metadata: {
      proposal_id: input.proposalId,
    },
  });

  await ensureFollowUp(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    typeKey: "proposal_review_call",
    notes: "Follow up по отправленному proposal через 24 часа.",
    assignedTo: input.managerUserId ?? null,
    createdBy: input.actorUserId,
    dueAt: addHours(new Date(), 24),
  });
}

export async function onProposalApproved(
  tx: DbClient,
  input: {
    actorUserId: string;
    proposalId: string;
    leadId?: string | null;
    dealId: string;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "APPROVED",
    eventKey: "proposal.approved",
    metadata: {
      proposal_id: input.proposalId,
    },
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "proposal",
    entityId: input.proposalId,
    typeKey: "proposal.approved",
    title: "Proposal approved",
    message: "Proposal approved. Следующий шаг: получить deposit.",
  });

  await ensureFollowUp(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    typeKey: "deposit_reminder",
    notes: "Deposit все еще не оплачен. Нужен follow up с клиентом.",
    assignedTo: input.managerUserId ?? null,
    createdBy: input.actorUserId,
    dueAt: addHours(new Date(), 48),
  });
}

export async function onDepositPaid(
  tx: DbClient,
  input: {
    actorUserId: string;
    proposalId: string;
    depositId: string;
    leadId?: string | null;
    dealId: string;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "DEPOSIT_PAID",
    eventKey: "deposit.paid",
    metadata: {
      proposal_id: input.proposalId,
      deposit_id: input.depositId,
    },
  });

  await completeMatchingFollowUps(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    typeKey: "deposit_reminder",
    outcome: "resolved_by_payment",
  });

  await ensureTask(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    entityType: "proposal",
    entityId: input.proposalId,
    title: "Создать project",
    description: "Deposit оплачен. Нужно перевести approved proposal в project.",
    assignedTo: input.managerUserId ?? null,
    createdBy: input.actorUserId,
    dueAt: new Date(),
    priority: "high",
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "deposit",
    entityId: input.depositId,
    typeKey: "deposit.paid",
    title: "Deposit paid",
    message: "Deposit оплачен. Можно создавать project.",
  });
}

export async function onProjectCreated(
  tx: DbClient,
  input: {
    actorUserId: string;
    projectId: string;
    proposalId: string;
    leadId?: string | null;
    dealId?: string | null;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "PROJECT_CREATED",
    eventKey: "project.created",
    metadata: {
      proposal_id: input.proposalId,
      project_id: input.projectId,
    },
  });

  await completeMatchingTasks(tx, {
    dealId: input.dealId,
    entityType: "proposal",
    entityId: input.proposalId,
    title: "Создать project",
  });

  await ensureTask(tx, {
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    entityType: "project",
    entityId: input.projectId,
    title: "Назначить монтаж",
    description: "Проект создан. Нужно назначить дату, crew и installers.",
    assignedTo: input.managerUserId ?? null,
    createdBy: input.actorUserId,
    dueAt: addHours(new Date(), 24),
    priority: "high",
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: input.projectId,
    typeKey: "project.created",
    title: "Project created",
    message: "Project создан из approved proposal. Осталось назначить монтаж.",
  });
}

export async function onInstallationAssigned(
  tx: DbClient,
  input: {
    actorUserId: string;
    projectId: string;
    dealId?: string | null;
    leadId?: string | null;
    managerUserId?: string | null;
    installerIds: string[];
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "SCHEDULED",
    eventKey: "installation.assigned",
    metadata: {
      project_id: input.projectId,
    },
  });

  await completeMatchingTasks(tx, {
    dealId: input.dealId,
    entityType: "project",
    entityId: input.projectId,
    title: "Назначить монтаж",
  });

  for (const installerId of input.installerIds) {
    await ensureNotification(tx, {
      recipientUserId: installerId,
      actorUserId: input.actorUserId,
      entityType: "project",
      entityId: input.projectId,
      typeKey: "installation.assigned",
      title: "Назначена работа",
      message: "Вам назначен новый install job. Проверьте дату, время и адрес.",
      dedupe: false,
    });
  }

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: input.projectId,
    typeKey: "installation.assigned",
    title: "Installation assigned",
    message: "Schedule, crew и installers назначены. Проект готов к выезду.",
  });
}

export async function onJobStarted(
  tx: DbClient,
  input: {
    actorUserId: string;
    projectId: string;
    dealId?: string | null;
    leadId?: string | null;
    managerUserId?: string | null;
    installerJobId: string;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "IN_PROGRESS",
    eventKey: "job.started",
    metadata: {
      project_id: input.projectId,
      installer_job_id: input.installerJobId,
    },
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: input.projectId,
    typeKey: "project.in_progress",
    title: "Монтаж начался",
    message: "Installer начал работу по проекту.",
  });
}

export async function onProjectCompleted(
  tx: DbClient,
  input: {
    actorUserId: string;
    projectId: string;
    dealId?: string | null;
    leadId?: string | null;
    managerUserId?: string | null;
  },
) {
  await syncPipelineStage(tx, {
    actorUserId: input.actorUserId,
    leadId: input.leadId ?? null,
    dealId: input.dealId,
    nextStatusCode: "COMPLETED",
    eventKey: "project.completed",
    metadata: {
      project_id: input.projectId,
    },
  });

  await ensureNotification(tx, {
    recipientUserId: input.managerUserId ?? null,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: input.projectId,
    typeKey: "project.completed",
    title: "Project completed",
    message: "Все installer jobs завершены. Проект закрыт как completed.",
  });
}
