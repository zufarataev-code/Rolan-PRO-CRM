import { Prisma } from "@prisma/client";

import { INSTALLER_JOB_STATUSES } from "@/features/projects/api";
import { recordInstallerPayrollAccrual } from "@/features/installer-operations/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type SessionLike = {
  user: { user_id: string };
  roles: string[];
};

type PhaseAssignment = {
  project_position_id: string;
  installer_id: string;
};

export type CreateProjectPhaseInput = {
  title: string;
  starts_at: string;
  ends_at: string;
  client_confirmed?: boolean;
  client_confirmation_note?: string | null;
  crew_id?: string | null;
  position_ids: string[];
  assignments?: PhaseAssignment[];
  notes?: string | null;
};

function isOwner(session: SessionLike) {
  return session.roles.includes(ROLE_CODES.OWNER);
}

function projectWhere(session: SessionLike, projectId: string) {
  return isOwner(session)
    ? { project_id: projectId }
    : { project_id: projectId, manager_id: session.user.user_id };
}

function parseDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function phaseMetadata(input: CreateProjectPhaseInput, phaseNumber: number) {
  return {
    phase_kind: "installation",
    phase_number: phaseNumber,
    client_confirmed: Boolean(input.client_confirmed),
    client_confirmed_at: input.client_confirmed ? new Date().toISOString() : null,
    client_confirmation_note: input.client_confirmation_note?.trim() || null,
    position_ids: input.position_ids,
    crew_id: input.crew_id ?? null,
    notes: input.notes?.trim() || null,
  } as Prisma.InputJsonValue;
}

export async function listProjectPhases(session: SessionLike, projectId: string) {
  const project = await prisma.project.findFirst({
    where: projectWhere(session, projectId),
    select: { project_id: true },
  });
  if (!project) return null;

  return prisma.calendarEvent.findMany({
    where: {
      project_id: projectId,
      event_type: { event_code: "INSTALL" },
    },
    orderBy: [{ starts_at: "asc" }, { created_at: "asc" }],
    include: {
      installer_jobs: {
        include: {
          installer: { select: { user_id: true, full_name: true, email: true } },
          position: {
            select: {
              position_id: true,
              title: true,
              service_type: { select: { service_code: true, name_ru: true, name_en: true } },
              film: { select: { brand_name_ru: true, model_name_ru: true } },
            },
          },
        },
      },
    },
  });
}

export async function createProjectPhase(
  session: SessionLike,
  projectId: string,
  input: CreateProjectPhaseInput,
) {
  const startsAt = parseDateTime(input.starts_at);
  const endsAt = parseDateTime(input.ends_at);
  const uniquePositionIds = [...new Set(input.position_ids.filter(Boolean))];
  const assignments = input.assignments ?? [];

  if (!input.title.trim() || !startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
    return "invalid_phase" as const;
  }
  if (uniquePositionIds.length === 0) return "missing_positions" as const;

  const project = await prisma.project.findFirst({
    where: projectWhere(session, projectId),
    include: {
      project_status: { select: { status_code: true } },
      project_positions: {
        where: { position_id: { in: uniquePositionIds } },
        select: { position_id: true },
      },
    },
  });

  if (!project) return null;
  if (project.project_status.status_code === "COMPLETED") return "project_completed" as const;
  if (project.project_positions.length !== uniquePositionIds.length) return "invalid_position" as const;

  const assignmentPositionIds = new Set<string>();
  for (const assignment of assignments) {
    if (!uniquePositionIds.includes(assignment.project_position_id)) return "invalid_assignment" as const;
    if (assignmentPositionIds.has(assignment.project_position_id)) return "duplicate_assignment" as const;
    assignmentPositionIds.add(assignment.project_position_id);
  }

  const installerIds = [...new Set(assignments.map((item) => item.installer_id))];
  if (installerIds.length) {
    const installers = await prisma.user.findMany({
      where: {
        user_id: { in: installerIds },
        is_active: true,
        user_accesses: {
          some: {
            is_active: true,
            role: { code: ROLE_CODES.INSTALLER, is_active: true },
          },
        },
      },
      select: { user_id: true },
    });
    if (installers.length !== installerIds.length) return "invalid_installer" as const;
  }

  if (input.crew_id) {
    const crew = await prisma.crew.findFirst({
      where: { crew_id: input.crew_id, active: true },
      select: { crew_id: true },
    });
    if (!crew) return "invalid_crew" as const;
  }

  const [eventType, eventTrack, scheduledProjectStatus, scheduledPositionStatus, phaseCount] = await Promise.all([
    prisma.eventType.findUnique({ where: { event_code: "INSTALL" } }),
    prisma.eventTrack.findUnique({ where: { track_code: "INSTALL" } }),
    prisma.projectStatus.findUnique({ where: { status_code: "SCHEDULED" } }),
    prisma.positionStatus.findUnique({ where: { status_code: "SCHEDULED" } }),
    prisma.calendarEvent.count({
      where: { project_id: projectId, event_type: { event_code: "INSTALL" } },
    }),
  ]);

  if (!eventType || !scheduledProjectStatus || !scheduledPositionStatus) {
    return "missing_status_config" as const;
  }

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        event_type_id: eventType.event_type_id,
        event_track_id: eventTrack?.event_track_id ?? null,
        project_id: projectId,
        assigned_user_id: assignments[0]?.installer_id ?? null,
        title: input.title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        status: "scheduled",
        metadata: phaseMetadata({ ...input, position_ids: uniquePositionIds }, phaseCount + 1),
      },
    });

    await tx.project.update({
      where: { project_id: projectId },
      data: {
        project_status_id: scheduledProjectStatus.project_status_id,
        install_date: project.install_date ?? startsAt,
      },
    });

    await tx.projectPosition.updateMany({
      where: { project_id: projectId, position_id: { in: uniquePositionIds } },
      data: { position_status_id: scheduledPositionStatus.position_status_id },
    });

    for (const assignment of assignments) {
      await tx.installerJob.upsert({
        where: { project_position_id: assignment.project_position_id },
        update: {
          project_id: projectId,
          calendar_event_id: event.calendar_event_id,
          crew_id: input.crew_id ?? null,
          installer_id: assignment.installer_id,
          status: INSTALLER_JOB_STATUSES.ASSIGNED,
          on_the_way_at: null,
          started_at: null,
          paused_at: null,
          completed_at: null,
        },
        create: {
          project_id: projectId,
          project_position_id: assignment.project_position_id,
          calendar_event_id: event.calendar_event_id,
          crew_id: input.crew_id ?? null,
          installer_id: assignment.installer_id,
          status: INSTALLER_JOB_STATUSES.ASSIGNED,
        },
      });

      await tx.notification.create({
        data: {
          recipient_user_id: assignment.installer_id,
          actor_user_id: session.user.user_id,
          entity_type: "project",
          entity_id: projectId,
          type_key: "installation.phase_assigned",
          title: "Назначен этап монтажа",
          message: `${input.title.trim()} · ${startsAt.toLocaleString("en-US")}`,
        },
      });
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: projectId,
        project_id: projectId,
        action_key: "installation.phase_created",
        message: `Создан этап монтажа: ${input.title.trim()}.`,
        metadata: {
          calendar_event_id: event.calendar_event_id,
          phase_number: phaseCount + 1,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          client_confirmed: Boolean(input.client_confirmed),
          position_ids: uniquePositionIds,
          installer_ids: installerIds,
        },
      },
    });

    return event;
  });

  return result;
}

export async function completeProjectPhase(session: SessionLike, projectId: string, eventId: string) {
  const phase = await prisma.calendarEvent.findFirst({
    where: {
      calendar_event_id: eventId,
      project_id: projectId,
      event_type: { event_code: "INSTALL" },
      project: projectWhere(session, projectId),
    },
    include: {
      installer_jobs: true,
    },
  });

  if (!phase) return null;
  if (phase.status === "completed") return { already_completed: true, calendar_event_id: eventId };
  if (phase.installer_jobs.length === 0) return "missing_installers" as const;

  const completedPositionStatus = await prisma.positionStatus.findUnique({ where: { status_code: "COMPLETED" } });
  if (!completedPositionStatus) return "missing_status_config" as const;

  const completedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.calendarEvent.updateMany({
      where: { calendar_event_id: eventId, status: { not: "completed" } },
      data: { status: "completed" },
    });
    if (claim.count === 0) return { claimed: false, projectCompleted: false };

    const positionIds: string[] = [];
    for (const job of phase.installer_jobs) {
      if (job.project_position_id) positionIds.push(job.project_position_id);
      if (job.status !== INSTALLER_JOB_STATUSES.COMPLETED) {
        await tx.installerJob.update({
          where: { installer_job_id: job.installer_job_id },
          data: {
            status: INSTALLER_JOB_STATUSES.COMPLETED,
            started_at: job.started_at ?? completedAt,
            completed_at: completedAt,
            completion_confirmed: true,
          },
        });
        await recordInstallerPayrollAccrual(tx, job.installer_job_id, completedAt);
      }
    }

    if (positionIds.length) {
      await tx.projectPosition.updateMany({
        where: { project_id: projectId, position_id: { in: positionIds } },
        data: { position_status_id: completedPositionStatus.position_status_id },
      });
    }

    const remaining = await tx.calendarEvent.count({
      where: {
        project_id: projectId,
        event_type: { event_code: "INSTALL" },
        status: { not: "completed" },
      },
    });

    let projectCompleted = false;
    if (remaining === 0) {
      const completedProjectStatus = await tx.projectStatus.findUnique({ where: { status_code: "COMPLETED" } });
      if (!completedProjectStatus) throw new Error("COMPLETED project status is not configured.");
      await tx.project.update({
        where: { project_id: projectId },
        data: { project_status_id: completedProjectStatus.project_status_id },
      });
      projectCompleted = true;
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: projectId,
        project_id: projectId,
        action_key: projectCompleted ? "project.installation_completed" : "installation.phase_completed",
        message: projectCompleted
          ? "Последний этап монтажа завершён. Проект перенесён в завершённые."
          : `Этап монтажа «${phase.title}» завершён.`,
        metadata: {
          calendar_event_id: eventId,
          completed_at: completedAt.toISOString(),
          project_completed: projectCompleted,
        },
      },
    });

    return { claimed: true, projectCompleted };
  });

  return {
    already_completed: !result.claimed,
    calendar_event_id: eventId,
    project_completed: result.projectCompleted,
    completed_at: completedAt,
  };
}
