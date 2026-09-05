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

export function validatePhaseAssignments(positionIds: string[], assignments: PhaseAssignment[]) {
  const uniquePositionIds = [...new Set(positionIds.filter(Boolean))];
  if (uniquePositionIds.length === 0) return "missing_positions" as const;
  if (assignments.length === 0) return "missing_installers" as const;

  const assignmentPositionIds = new Set<string>();
  for (const assignment of assignments) {
    if (!assignment.project_position_id || !assignment.installer_id) return "invalid_assignment" as const;
    if (!uniquePositionIds.includes(assignment.project_position_id)) return "invalid_assignment" as const;
    if (assignmentPositionIds.has(assignment.project_position_id)) return "duplicate_assignment" as const;
    assignmentPositionIds.add(assignment.project_position_id);
  }

  // Every service/position in an installation phase must have a responsible
  // installer before the phase can be scheduled. A phase is execution, not a
  // placeholder calendar note.
  if (assignmentPositionIds.size !== uniquePositionIds.length) return "unassigned_positions" as const;

  return null;
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

  const assignmentError = validatePhaseAssignments(uniquePositionIds, assignments);
  if (assignmentError) return assignmentError;

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

  const alreadyAssigned = await prisma.installerJob.findFirst({
    where: {
      project_id: projectId,
      project_position_id: { in: uniquePositionIds },
    },
    select: { installer_job_id: true, project_position_id: true, calendar_event_id: true },
  });
  if (alreadyAssigned) return "position_already_assigned" as const;

  const installerIds = [...new Set(assignments.map((item) => item.installer_id))];
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

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize phase creation per project so two concurrent requests cannot
      // both schedule the same position after passing the preflight check.
      await tx.$queryRaw(
        Prisma.sql`SELECT project_id FROM projects WHERE project_id = ${projectId}::uuid FOR UPDATE`,
      );

      const conflictingJob = await tx.installerJob.findFirst({
        where: {
          project_id: projectId,
          project_position_id: { in: uniquePositionIds },
        },
        select: { installer_job_id: true },
      });
      if (conflictingJob) return "position_already_assigned" as const;

      const event = await tx.calendarEvent.create({
        data: {
          event_type_id: eventType.event_type_id,
          event_track_id: eventTrack?.event_track_id ?? null,
          project_id: projectId,
          assigned_user_id: assignments[0].installer_id,
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
        await tx.installerJob.create({
          data: {
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "position_already_assigned" as const;
    }
    throw error;
  }
}

export async function completeProjectPhase(session: SessionLike, projectId: string, eventId: string) {
  const accessibleProject = await prisma.project.findFirst({
    where: projectWhere(session, projectId),
    select: { project_id: true },
  });
  if (!accessibleProject) return null;

  const completedPositionStatus = await prisma.positionStatus.findUnique({ where: { status_code: "COMPLETED" } });
  if (!completedPositionStatus) return "missing_status_config" as const;

  const completedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // All phase completions for one project serialize on the project row. If
    // two last phases are completed simultaneously, the second request waits
    // and then sees the first one's committed state before deciding whether
    // the whole project is finished.
    await tx.$queryRaw(
      Prisma.sql`SELECT project_id FROM projects WHERE project_id = ${projectId}::uuid FOR UPDATE`,
    );

    const phase = await tx.calendarEvent.findFirst({
      where: {
        calendar_event_id: eventId,
        project_id: projectId,
        event_type: { event_code: "INSTALL" },
      },
      include: { installer_jobs: true },
    });

    if (!phase) return "phase_not_found" as const;
    if (phase.status === "completed") {
      return { claimed: false, projectCompleted: false, phaseTitle: phase.title };
    }
    if (phase.installer_jobs.length === 0) return "missing_installers" as const;

    await tx.calendarEvent.update({
      where: { calendar_event_id: eventId },
      data: { status: "completed" },
    });

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

    return { claimed: true, projectCompleted, phaseTitle: phase.title };
  });

  if (result === "phase_not_found") return null;
  if (result === "missing_installers") return result;

  return {
    already_completed: !result.claimed,
    calendar_event_id: eventId,
    project_completed: result.projectCompleted,
    completed_at: completedAt,
  };
}
