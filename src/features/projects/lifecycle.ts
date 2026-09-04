import { INSTALLER_JOB_STATUSES } from "@/features/projects/api";
import { calculatePositionFinance } from "@/features/projects/service";
import { onProjectCompleted } from "@/features/core/events";
import { recordInstallerPayrollAccrual } from "@/features/installer-operations/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type ProjectSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

function asNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function projectAccessWhere(session: ProjectSession) {
  if (session.roles.includes(ROLE_CODES.OWNER)) return {};
  return { manager_id: session.user.user_id };
}

export async function getProjectLifecycleSummary(session: ProjectSession, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      project_id: projectId,
      ...projectAccessWhere(session),
    },
    include: {
      project_status: true,
      schedule_assignment: {
        include: {
          crew: {
            select: { crew_id: true, name: true },
          },
        },
      },
      project_positions: {
        include: {
          service_type: true,
          film: true,
          complexity_level: true,
          position_addons: {
            include: { service_addon: true },
          },
        },
        orderBy: { sort_order: "asc" },
      },
      installer_jobs: {
        include: {
          installer: {
            select: { user_id: true, full_name: true },
          },
        },
        orderBy: { created_at: "asc" },
      },
    },
  });

  if (!project) return null;

  const financeLines = project.project_positions.map((position) => ({
    position,
    finance: calculatePositionFinance(position),
  }));
  const totalBillableSqft = financeLines.reduce((sum, line) => sum + line.finance.billable_sqft, 0);
  const totalActualFilmSqft = financeLines.reduce((sum, line) => sum + line.finance.actual_film_sqft, 0);
  const clientTotal = financeLines.reduce((sum, line) => sum + line.finance.revenue_subtotal, 0);
  const addonsTotal = financeLines.reduce((sum, line) => sum + line.finance.addons_revenue, 0);
  const materialCost = financeLines.reduce((sum, line) => sum + line.finance.material_cost_total, 0);
  const installationCost = financeLines.reduce((sum, line) => sum + line.finance.installation_cost_total, 0);
  const estimatedCost = financeLines.reduce((sum, line) => sum + line.finance.estimated_cost, 0);
  const estimatedProfit = financeLines.reduce((sum, line) => sum + line.finance.estimated_profit, 0);
  const isOwner = session.roles.includes(ROLE_CODES.OWNER);
  const completedJobs = project.installer_jobs.filter((job) => job.status === INSTALLER_JOB_STATUSES.COMPLETED).length;
  const activeJobs = project.installer_jobs.length - completedJobs;
  const installerMap = new Map(
    project.installer_jobs.map((job) => [job.installer.user_id, job.installer]),
  );

  return {
    project_id: project.project_id,
    project_status: {
      status_code: project.project_status.status_code,
      name_ru: project.project_status.name_ru,
    },
    is_completed: project.project_status.status_code === "COMPLETED",
    schedule: project.schedule_assignment
      ? {
          date: project.schedule_assignment.date,
          start_time: project.schedule_assignment.start_time,
          end_time: project.schedule_assignment.end_time,
          crew: project.schedule_assignment.crew,
        }
      : null,
    execution: {
      jobs_total: project.installer_jobs.length,
      jobs_active: activeJobs,
      jobs_completed: completedJobs,
      installers: Array.from(installerMap.values()),
    },
    calculator: {
      positions_count: project.project_positions.length,
      total_billable_sqft: Number(totalBillableSqft.toFixed(2)),
      total_actual_film_sqft: Number(totalActualFilmSqft.toFixed(2)),
      client_total: Number(clientTotal.toFixed(2)),
      addons_total: Number(addonsTotal.toFixed(2)),
      lines: financeLines.map(({ position, finance }) => {
        const dynamic = asRecord(position.dynamic_fields);
        return {
          position_id: position.position_id,
          title: position.title ?? position.service_type.name_ru,
          service_name: position.service_type.name_ru,
          film_name: position.film
            ? `${position.film.brand_name_ru} ${position.film.model_name_ru}`.trim()
            : null,
          sqft: Number(asNumber(dynamic.sqft).toFixed(2)),
          actual_film_sqft: Number(asNumber(dynamic.actual_film_sqft || dynamic.sqft).toFixed(2)),
          client_amount: finance.revenue_subtotal,
        };
      }),
      internal_finance: isOwner
        ? {
            material_cost: Number(materialCost.toFixed(2)),
            installation_cost: Number(installationCost.toFixed(2)),
            estimated_cost: Number(estimatedCost.toFixed(2)),
            estimated_profit: Number(estimatedProfit.toFixed(2)),
            estimated_margin_percent:
              clientTotal > 0 ? Number(((estimatedProfit / clientTotal) * 100).toFixed(2)) : 0,
          }
        : null,
    },
  };
}

export async function completeProjectInstallation(session: ProjectSession, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      project_id: projectId,
      ...projectAccessWhere(session),
    },
    include: {
      project_status: true,
      installer_jobs: {
        select: {
          installer_job_id: true,
          status: true,
          started_at: true,
          completed_at: true,
        },
      },
    },
  });

  if (!project) return null;

  if (project.project_status.status_code === "COMPLETED") {
    return {
      project_id: project.project_id,
      already_completed: true,
      completed_jobs: project.installer_jobs.filter((job) => job.status === INSTALLER_JOB_STATUSES.COMPLETED).length,
    };
  }

  const [completedProjectStatus, completedPositionStatus] = await Promise.all([
    prisma.projectStatus.findUnique({ where: { status_code: "COMPLETED" } }),
    prisma.positionStatus.findUnique({ where: { status_code: "COMPLETED" } }),
  ]);

  if (!completedProjectStatus || !completedPositionStatus) {
    return "missing_status_config" as const;
  }

  const completedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    let completedJobs = 0;

    for (const job of project.installer_jobs) {
      if (job.status === INSTALLER_JOB_STATUSES.COMPLETED) continue;

      await tx.installerJob.update({
        where: { installer_job_id: job.installer_job_id },
        data: {
          status: INSTALLER_JOB_STATUSES.COMPLETED,
          started_at: job.started_at ?? completedAt,
          completed_at: completedAt,
        },
      });
      await recordInstallerPayrollAccrual(tx, job.installer_job_id, completedAt);
      completedJobs += 1;
    }

    await tx.projectPosition.updateMany({
      where: { project_id: project.project_id },
      data: { position_status_id: completedPositionStatus.position_status_id },
    });

    await tx.project.update({
      where: { project_id: project.project_id },
      data: { project_status_id: completedProjectStatus.project_status_id },
    });

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: project.project_id,
        project_id: project.project_id,
        action_key: "installation.completed_by_manager",
        message: "Монтаж проекта завершён менеджером. Проект перенесён в завершённые.",
        metadata: {
          completed_at: completedAt.toISOString(),
          completed_jobs: completedJobs,
          total_jobs: project.installer_jobs.length,
        },
      },
    });

    await onProjectCompleted(tx, {
      actorUserId: session.user.user_id,
      projectId: project.project_id,
      dealId: project.deal_id,
      managerUserId: project.manager_id,
    });

    return completedJobs;
  });

  return {
    project_id: project.project_id,
    already_completed: false,
    completed_jobs: result,
    completed_at: completedAt,
  };
}
