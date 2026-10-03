import { Prisma } from "@prisma/client";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type Session = { user: { user_id: string }; roles: string[] };

export function serviceEventScope(session: Session): Prisma.CalendarEventWhereInput {
  if (session.roles.includes(ROLE_CODES.OWNER)) return {};
  if (session.roles.includes(ROLE_CODES.MANAGER)) return { project: { manager_id: session.user.user_id } };
  return { installer_jobs: { some: { installer_id: session.user.user_id } } };
}

// Select operational fields deliberately; never send dynamic_fields, project
// prices, costs, payroll or unrestricted employee records to field devices.
export async function listServiceExecutionEvents(session: Session, eventId?: string) {
  const manager = session.roles.includes(ROLE_CODES.OWNER) || session.roles.includes(ROLE_CODES.MANAGER);
  const events = await prisma.calendarEvent.findMany({
    where: {
      AND: [serviceEventScope(session), {
        event_type: { event_code: "INSTALL" }, project_id: { not: null },
        ...(eventId ? { calendar_event_id: eventId } : {}),
      }],
    },
    orderBy: { starts_at: "asc" },
    select: {
      calendar_event_id: true, title: true, starts_at: true, ends_at: true, status: true, metadata: true,
      project: { select: {
        project_id: true, project_code: true, title: true, address: true,
        client: { select: { name: true, phone: true } },
        manager: { select: { user_id: true, legacy_user_ids: true } },
      } },
      installer_jobs: {
        where: manager ? {} : { installer_id: session.user.user_id },
        select: {
          installer_job_id: true, status: true,
          installer: { select: { user_id: true, full_name: true, legacy_user_ids: true } },
          position: { select: {
            position_id: true, title: true, notes: true,
            service_type: { select: { service_code: true, name_ru: true } },
            film: { select: { brand_name_ru: true, model_name_ru: true, model_code: true } },
            measurements: { select: {
              measurement_id: true, supersedes_measurement_id: true,
              room_name: true, window_id: true, width: true, height: true, quantity: true, sqft: true,
              verification_status: true,
            } },
          } },
        },
      },
    },
  });
  return events.map(({ metadata, ...event }) => ({
    ...event,
    notes: metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.notes === "string" ? metadata.notes : null,
    installer_jobs: event.installer_jobs.map(job => {
      if (!job.position) return job;
      const superseded = new Set(job.position.measurements.map(row => row.supersedes_measurement_id));
      return { ...job, position: { ...job.position,
        measurements: job.position.measurements.filter(row => !superseded.has(row.measurement_id)),
      } };
    }),
  }));
}
