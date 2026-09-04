import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type ProjectSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

function projectAccessWhere(session: ProjectSession) {
  if (session.roles.includes(ROLE_CODES.OWNER)) return {};
  return { manager_id: session.user.user_id };
}

export async function listCompletedProjectsForSession(session: ProjectSession) {
  const projects = await prisma.project.findMany({
    where: {
      ...projectAccessWhere(session),
      project_status: {
        status_code: "COMPLETED",
      },
    },
    include: {
      client: {
        select: {
          client_id: true,
          name: true,
          phone: true,
        },
      },
      city: {
        select: {
          name_ru: true,
        },
      },
      project_status: {
        select: {
          status_code: true,
          name_ru: true,
        },
      },
      installer_jobs: {
        include: {
          installer: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
      },
      activity_logs: {
        where: {
          OR: [
            { action_key: "installation.completed_by_manager" },
            { action_key: "installer_job.completed" },
          ],
        },
        orderBy: {
          created_at: "desc",
        },
        take: 1,
        select: {
          created_at: true,
          message: true,
        },
      },
    },
    orderBy: [{ updated_at: "desc" }],
  });

  return projects.map((project) => {
    const installers = Array.from(
      new Map(
        project.installer_jobs.map((job) => [
          job.installer.user_id,
          {
            user_id: job.installer.user_id,
            full_name: job.installer.full_name,
          },
        ]),
      ).values(),
    );

    return {
      project_id: project.project_id,
      project_code: project.project_code,
      title: project.title,
      address: project.address,
      install_date: project.install_date,
      updated_at: project.updated_at,
      completed_at: project.activity_logs[0]?.created_at ?? project.updated_at,
      completion_note: project.activity_logs[0]?.message ?? null,
      client: project.client,
      city: project.city,
      project_status: project.project_status,
      installers,
    };
  });
}
