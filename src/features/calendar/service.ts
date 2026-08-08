import { Prisma } from "@prisma/client";

import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type PlanningSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

export type PlanningViewMode = "day" | "week" | "month";

export type ManagerPlanningItem = {
  item_id: string;
  entity_type: "consultation" | "installation";
  entity_id: string;
  kind_label: string;
  title: string;
  subtitle: string;
  date_key: string;
  day_label: string;
  starts_at: string;
  ends_at: string;
  time_label: string;
  status_code: string;
  status_label: string;
  color_token: string;
  problem_flag: boolean;
  tags: string[];
  address: string | null;
  assignee_label: string | null;
  crew_label: string | null;
  installer_labels: string[];
  note: string | null;
  detail_href: string;
  map_href: string | null;
  map_embed_href: string | null;
};

export type ManagerPlanningDay = {
  date_key: string;
  label: string;
  full_label: string;
  items: ManagerPlanningItem[];
  is_in_primary_range: boolean;
  is_today: boolean;
};

export type ManagerPlanningData = {
  anchor_date: string;
  view_mode: PlanningViewMode;
  range_label: string;
  metrics: {
    total: number;
    consultations: number;
    installations: number;
    flagged: number;
    with_tags: number;
  };
  days: ManagerPlanningDay[];
  quick_tags: string[];
};

type PlanningRange = {
  query_start: Date;
  query_end: Date;
  day_start: Date;
  day_count: number;
  primary_start: Date;
  primary_end: Date;
  range_label: string;
};

const QUICK_TAGS = [
  "Срочно",
  "VIP",
  "Подтвердить время",
  "Нужен звонок",
  "Пробка",
  "Smart",
  "Solar",
  "Safety",
  "Повторный замер",
  "Электрика",
] as const;

export function normalizePlanningViewMode(value: string | null | undefined): PlanningViewMode {
  if (value === "day" || value === "month") {
    return value;
  }

  return "week";
}

function isOwner(session: PlanningSession) {
  return session.roles.includes(ROLE_CODES.OWNER);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getWeekStart(value: Date) {
  const local = startOfLocalDay(value);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(local, diff);
}

function getMonthStart(value: Date) {
  const local = startOfLocalDay(value);
  return new Date(local.getFullYear(), local.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthGridStart(value: Date) {
  return getWeekStart(getMonthStart(value));
}

function getMonthGridEnd(value: Date) {
  const monthStart = getMonthStart(value);
  const nextMonthStart = addMonths(monthStart, 1);
  const lastDay = addDays(nextMonthStart, -1);
  const lastDayStart = startOfLocalDay(lastDay);
  const weekday = lastDayStart.getDay();
  const diffToSunday = weekday === 0 ? 0 : 7 - weekday;
  return addDays(lastDayStart, diffToSunday + 1);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(value: Date, viewMode: PlanningViewMode) {
  if (viewMode === "month") {
    return value.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }

  return value.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

function formatFullDayLabel(value: Date) {
  return value.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

function formatRangeLabel(viewMode: PlanningViewMode, primaryStart: Date, primaryEnd: Date) {
  if (viewMode === "day") {
    return formatFullDayLabel(primaryStart);
  }

  if (viewMode === "month") {
    return primaryStart.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }

  return `${formatDayLabel(primaryStart, "week")} - ${formatDayLabel(addDays(primaryEnd, -1), "week")}`;
}

function formatTimeLabel(start: Date, end: Date) {
  return `${start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString(
    "ru-RU",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

function buildMapHref(address: string | null) {
  if (!address?.trim()) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

function buildEmbedHref(address: string | null) {
  if (!address?.trim()) {
    return null;
  }

  return `https://maps.google.com/maps?q=${encodeURIComponent(address.trim())}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
}

function asObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function sanitizePlanningTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 12),
    ),
  );
}

function normalizeInputTags(tags: string[]) {
  return sanitizePlanningTags(tags).slice(0, 12);
}

function consultationWhere(session: PlanningSession, rangeStart: Date, rangeEnd: Date): Prisma.ConsultationWhereInput {
  return {
    scheduled_start_at: {
      gte: rangeStart,
      lt: rangeEnd,
    },
    ...(isOwner(session)
      ? {}
      : {
          OR: [{ assigned_manager_id: session.user.user_id }, { created_by: session.user.user_id }],
        }),
  };
}

function scheduleWhere(session: PlanningSession, rangeStart: Date, rangeEnd: Date): Prisma.ScheduleAssignmentWhereInput {
  return {
    date: {
      gte: rangeStart,
      lt: rangeEnd,
    },
    ...(isOwner(session)
      ? {}
      : {
          project: {
            manager_id: session.user.user_id,
          },
        }),
  };
}

function combineScheduleDate(date: Date, time: Date | null, fallbackHour: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (!time) {
    return new Date(Date.UTC(year, month, day, fallbackHour, 0, 0, 0));
  }

  return new Date(
    Date.UTC(year, month, day, time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), time.getUTCMilliseconds()),
  );
}

function getConsultationColor(status: string, colorToken: string | null, surveyStatus: string | null) {
  if (colorToken?.trim()) {
    return colorToken.trim().toLowerCase();
  }

  if (status === "completed" || surveyStatus === "completed") {
    return "green";
  }

  if (status === "canceled") {
    return "slate";
  }

  return "yellow";
}

function getInstallColor(statusCode: string, problemFlag: boolean, colorToken: string | null) {
  if (problemFlag) {
    return "red";
  }

  if (colorToken?.trim()) {
    return colorToken.trim().toLowerCase();
  }

  if (statusCode === "IN_PROGRESS") {
    return "green";
  }

  if (statusCode === "COMPLETED") {
    return "slate";
  }

  return "blue";
}

function buildPlanningRange(anchor: Date, viewMode: PlanningViewMode): PlanningRange {
  if (viewMode === "day") {
    const dayStart = startOfLocalDay(anchor);
    const dayEnd = addDays(dayStart, 1);

    return {
      query_start: dayStart,
      query_end: dayEnd,
      day_start: dayStart,
      day_count: 1,
      primary_start: dayStart,
      primary_end: dayEnd,
      range_label: formatRangeLabel("day", dayStart, dayEnd),
    };
  }

  if (viewMode === "month") {
    const monthStart = getMonthStart(anchor);
    const monthEnd = addMonths(monthStart, 1);
    const gridStart = getMonthGridStart(anchor);
    const gridEnd = getMonthGridEnd(anchor);
    const dayCount = Math.max(35, Math.ceil((gridEnd.getTime() - gridStart.getTime()) / 86400000));

    return {
      query_start: gridStart,
      query_end: gridEnd,
      day_start: gridStart,
      day_count: dayCount,
      primary_start: monthStart,
      primary_end: monthEnd,
      range_label: formatRangeLabel("month", monthStart, monthEnd),
    };
  }

  const weekStart = getWeekStart(anchor);
  const weekEnd = addDays(weekStart, 7);

  return {
    query_start: weekStart,
    query_end: weekEnd,
    day_start: weekStart,
    day_count: 7,
    primary_start: weekStart,
    primary_end: weekEnd,
    range_label: formatRangeLabel("week", weekStart, weekEnd),
  };
}

export async function getManagerPlanningData(
  session: PlanningSession,
  options?: {
    anchorDate?: string | null;
    viewMode?: PlanningViewMode;
  },
): Promise<ManagerPlanningData> {
  const anchor = options?.anchorDate?.trim() ? new Date(`${options.anchorDate.trim()}T12:00:00`) : new Date();
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const viewMode = options?.viewMode ?? "week";
  const range = buildPlanningRange(safeAnchor, viewMode);

  const [consultations, assignments] = await Promise.all([
    prisma.consultation.findMany({
      where: consultationWhere(session, range.query_start, range.query_end),
      orderBy: [{ scheduled_start_at: "asc" }, { created_at: "desc" }],
      include: {
        client: {
          select: {
            name: true,
            service_address: true,
          },
        },
        lead: {
          select: {
            name: true,
          },
        },
        survey: {
          select: {
            status: true,
          },
        },
        assigned_consultant: {
          select: {
            full_name: true,
          },
        },
        calendar_event: {
          select: {
            color_token: true,
            metadata: true,
          },
        },
      },
    }),
    prisma.scheduleAssignment.findMany({
      where: scheduleWhere(session, range.query_start, range.query_end),
      orderBy: [{ date: "asc" }, { start_time: "asc" }],
      select: {
        schedule_assignment_id: true,
        date: true,
        start_time: true,
        end_time: true,
        planning_tags: true,
        crew: {
          select: {
            name: true,
          },
        },
        project: {
          select: {
            project_id: true,
            title: true,
            address: true,
            manager_notes: true,
            problem_flag: true,
            client: {
              select: {
                name: true,
                service_address: true,
              },
            },
            project_status: {
              select: {
                status_code: true,
                name_ru: true,
                color_token: true,
              },
            },
            installer_jobs: {
              select: {
                installer: {
                  select: {
                    full_name: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const consultationItems: ManagerPlanningItem[] = consultations.map((consultation) => {
    const dateKey = formatDateKey(consultation.scheduled_start_at);
    const metadata = asObject(consultation.calendar_event?.metadata);
    const tags = sanitizePlanningTags(metadata.planning_tags);
    const address = consultation.location_address ?? consultation.client?.service_address ?? null;
    const colorToken = getConsultationColor(
      consultation.status,
      consultation.calendar_event?.color_token ?? null,
      consultation.survey?.status ?? null,
    );

    return {
      item_id: `consultation:${consultation.consultation_id}`,
      entity_type: "consultation",
      entity_id: consultation.consultation_id,
      kind_label: "Консультация",
      title: consultation.title,
      subtitle: consultation.client?.name ?? consultation.lead?.name ?? "Без клиента",
      date_key: dateKey,
      day_label: formatDayLabel(consultation.scheduled_start_at, viewMode),
      starts_at: consultation.scheduled_start_at.toISOString(),
      ends_at: consultation.scheduled_end_at.toISOString(),
      time_label: formatTimeLabel(consultation.scheduled_start_at, consultation.scheduled_end_at),
      status_code: consultation.status,
      status_label:
        consultation.survey?.status === "completed"
          ? "Survey completed"
          : consultation.status === "completed"
            ? "Проведена"
            : "Запланирована",
      color_token: colorToken,
      problem_flag: false,
      tags,
      address,
      assignee_label: consultation.assigned_consultant.full_name,
      crew_label: null,
      installer_labels: [],
      note: consultation.manager_notes ?? null,
      detail_href: `/manager/crm/consultations/${consultation.consultation_id}`,
      map_href: buildMapHref(address),
      map_embed_href: buildEmbedHref(address),
    };
  });

  const installItems: ManagerPlanningItem[] = assignments.map((assignment) => {
    const startAt = combineScheduleDate(assignment.date, assignment.start_time, 9);
    const endAt = combineScheduleDate(assignment.date, assignment.end_time, startAt.getUTCHours() + 2);
    const address = assignment.project.address ?? assignment.project.client.service_address ?? null;
    const tags = sanitizePlanningTags(assignment.planning_tags);
    const installerLabels = Array.from(
      new Set(
        assignment.project.installer_jobs
          .map((job) => job.installer.full_name)
          .filter((label): label is string => Boolean(label?.trim())),
      ),
    );

    return {
      item_id: `installation:${assignment.schedule_assignment_id}`,
      entity_type: "installation",
      entity_id: assignment.schedule_assignment_id,
      kind_label: "Монтаж",
      title: assignment.project.title,
      subtitle: assignment.project.client.name,
      date_key: formatDateKey(assignment.date),
      day_label: formatDayLabel(assignment.date, viewMode),
      starts_at: startAt.toISOString(),
      ends_at: endAt.toISOString(),
      time_label: formatTimeLabel(startAt, endAt),
      status_code: assignment.project.project_status.status_code,
      status_label: assignment.project.project_status.name_ru,
      color_token: getInstallColor(
        assignment.project.project_status.status_code,
        assignment.project.problem_flag,
        assignment.project.project_status.color_token,
      ),
      problem_flag: assignment.project.problem_flag,
      tags,
      address,
      assignee_label: null,
      crew_label: assignment.crew.name,
      installer_labels: installerLabels,
      note: assignment.project.manager_notes ?? null,
      detail_href: `/manager/projects/${assignment.project.project_id}#assignment`,
      map_href: buildMapHref(address),
      map_embed_href: buildEmbedHref(address),
    };
  });

  const items = [...consultationItems, ...installItems].sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const todayKey = formatDateKey(new Date());
  const primaryStartKey = formatDateKey(range.primary_start);
  const primaryEndExclusiveKey = formatDateKey(range.primary_end);

  const days = Array.from({ length: range.day_count }, (_, index) => {
    const date = addDays(range.day_start, index);
    const dateKey = formatDateKey(date);

    return {
      date_key: dateKey,
      label: formatDayLabel(date, viewMode),
      full_label: formatFullDayLabel(date),
      items: items.filter((item) => item.date_key === dateKey),
      is_in_primary_range: dateKey >= primaryStartKey && dateKey < primaryEndExclusiveKey,
      is_today: dateKey === todayKey,
    };
  });

  const metrics = {
    total: items.length,
    consultations: consultationItems.length,
    installations: installItems.length,
    flagged: items.filter((item) => item.problem_flag).length,
    with_tags: items.filter((item) => item.tags.length > 0).length,
  };

  return {
    anchor_date: formatDateKey(safeAnchor),
    view_mode: viewMode,
    range_label: range.range_label,
    metrics,
    days,
    quick_tags: [...QUICK_TAGS],
  };
}

export async function updatePlanningTagsForSession(
  session: PlanningSession,
  input: {
    entity_type: "consultation" | "installation";
    entity_id: string;
    tags: string[];
  },
) {
  const tags = normalizeInputTags(input.tags);

  if (input.entity_type === "consultation") {
    const consultation = await prisma.consultation.findFirst({
      where: {
        consultation_id: input.entity_id,
        ...(isOwner(session)
          ? {}
          : {
              OR: [{ assigned_manager_id: session.user.user_id }, { created_by: session.user.user_id }],
            }),
      },
      select: {
        consultation_id: true,
        calendar_event: {
          select: {
            calendar_event_id: true,
            metadata: true,
          },
        },
      },
    });

    if (!consultation?.calendar_event?.calendar_event_id) {
      return null;
    }

    const metadata = asObject(consultation.calendar_event.metadata);

    await prisma.calendarEvent.update({
      where: {
        calendar_event_id: consultation.calendar_event.calendar_event_id,
      },
      data: {
        metadata: {
          ...metadata,
          planning_tags: tags,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      tags,
    };
  }

  const assignment = await prisma.scheduleAssignment.findFirst({
    where: {
      schedule_assignment_id: input.entity_id,
      ...(isOwner(session)
        ? {}
        : {
            project: {
              manager_id: session.user.user_id,
            },
          }),
    },
    select: {
      schedule_assignment_id: true,
    },
  });

  if (!assignment) {
    return null;
  }

  const scheduleAssignmentUpdate: Prisma.ScheduleAssignmentUpdateInput = {
    planning_tags: tags as Prisma.InputJsonValue,
  };

  await prisma.scheduleAssignment.update({
    where: {
      schedule_assignment_id: assignment.schedule_assignment_id,
    },
    data: scheduleAssignmentUpdate,
  });

  return {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    tags,
  };
}
