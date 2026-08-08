import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ROLE_CODES } from "@/lib/auth/constants";
import { serializeConsultationDetail, serializeConsultationListItem } from "@/features/consultations/serializers";
import { logConsultationActivity } from "@/features/consultations/activity";
import { onConsultationScheduled, onSurveyCompleted } from "@/features/core/events";

type SessionLike = {
  user: {
    user_id: string;
  };
  roles: string[];
};

function isOwner(session: SessionLike) {
  return session.roles.includes(ROLE_CODES.OWNER);
}

function isManager(session: SessionLike) {
  return session.roles.includes(ROLE_CODES.MANAGER);
}

function isConsultant(session: SessionLike) {
  return session.roles.includes(ROLE_CODES.CONSULTANT);
}

function calculateSqft(width?: number | null, height?: number | null) {
  if (!width || !height) {
    return null;
  }

  const sqft = (width * height) / 144;
  return Number(sqft.toFixed(2));
}

function normalizeQuantity(quantity?: number | null) {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    return 1;
  }

  return Number(quantity.toFixed(2));
}

function nullableJson(value: Prisma.InputJsonValue | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.DbNull : value;
}

function buildConsultationListWhere(session: SessionLike) {
  if (isOwner(session)) {
    return {};
  }

  if (isManager(session)) {
    return {
      OR: [{ assigned_manager_id: session.user.user_id }, { created_by: session.user.user_id }],
    };
  }

  return {
    assigned_consultant_id: session.user.user_id,
  };
}

const consultationListInclude = {
  lead: {
    select: {
      lead_id: true,
      lead_code: true,
      name: true,
    },
  },
  deal: {
    select: {
      deal_id: true,
      deal_code: true,
      title: true,
    },
  },
  client: {
    select: {
      client_id: true,
      client_code: true,
      name: true,
      phone: true,
    },
  },
  assigned_consultant: {
    select: {
      user_id: true,
      full_name: true,
    },
  },
  assigned_manager: {
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
} satisfies Prisma.ConsultationInclude;

const fileSelect = {
  file_id: true,
  file_type: true,
  original_name: true,
  file_url: true,
  mime_type: true,
  size_bytes: true,
  created_at: true,
} as const;

const consultationDetailInclude = {
  lead: {
    select: {
      lead_id: true,
      lead_code: true,
      name: true,
      phone: true,
      email: true,
    },
  },
  deal: {
    select: {
      deal_id: true,
      deal_code: true,
      title: true,
      estimated_value: true,
      currency: true,
      assigned_manager_id: true,
    },
  },
  client: {
    select: {
      client_id: true,
      client_code: true,
      name: true,
      phone: true,
      email: true,
      service_address: true,
    },
  },
  assigned_consultant: {
    select: {
      user_id: true,
      full_name: true,
      email: true,
    },
  },
  assigned_manager: {
    select: {
      user_id: true,
      full_name: true,
      email: true,
    },
  },
  calendar_event: {
    include: {
      event_type: {
        select: {
          event_code: true,
          name_ru: true,
          name_en: true,
        },
      },
      event_track: {
        select: {
          track_code: true,
          name_ru: true,
          name_en: true,
        },
      },
    },
  },
  survey: {
    include: {
      measurements: {
        orderBy: {
          sort_order: "asc",
        },
        include: {
          complexity_level: {
            select: {
              complexity_level_id: true,
              level_code: true,
              name_ru: true,
              name_en: true,
              color_token: true,
            },
          },
          attachments_files: {
            select: fileSelect,
          },
        },
      },
      recommendations: {
        orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
        include: {
          measurement: {
            select: {
              measurement_id: true,
              room_name: true,
              window_id: true,
            },
          },
          service_type: {
            select: {
              service_type_id: true,
              service_code: true,
              name_ru: true,
              name_en: true,
            },
          },
          film: {
            select: {
              film_id: true,
              category_name_ru: true,
              category_name_en: true,
              brand_name_ru: true,
              brand_name_en: true,
              model_name_ru: true,
              model_name_en: true,
              thickness: true,
            },
          },
        },
      },
      attachments_files: {
        select: fileSelect,
      },
    },
  },
  attachments_files: {
    select: fileSelect,
  },
} satisfies Prisma.ConsultationInclude;

async function getEventTypeId(eventCode: string) {
  const eventType = await prisma.eventType.findUnique({
    where: {
      event_code: eventCode,
    },
    select: {
      event_type_id: true,
    },
  });

  return eventType?.event_type_id ?? null;
}

async function getEventTrackId(trackCode: string) {
  const eventTrack = await prisma.eventTrack.findUnique({
    where: {
      track_code: trackCode,
    },
    select: {
      event_track_id: true,
    },
  });

  return eventTrack?.event_track_id ?? null;
}

function canAccessConsultation(session: SessionLike, consultation: { assigned_consultant_id: string; assigned_manager_id: string | null; created_by: string }) {
  if (isOwner(session)) {
    return true;
  }

  if (isManager(session)) {
    return consultation.assigned_manager_id === session.user.user_id || consultation.created_by === session.user.user_id;
  }

  return consultation.assigned_consultant_id === session.user.user_id;
}

export async function listConsultationsForSession(session: SessionLike) {
  const consultations = await prisma.consultation.findMany({
    where: buildConsultationListWhere(session),
    orderBy: [{ scheduled_start_at: "asc" }, { created_at: "desc" }],
    include: consultationListInclude,
  });

  return consultations.map(serializeConsultationListItem);
}

export async function getConsultationByIdForSession(session: SessionLike, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({
    where: {
      consultation_id: consultationId,
    },
    include: consultationDetailInclude,
  });

  if (!consultation || !canAccessConsultation(session, consultation)) {
    return null;
  }

  return serializeConsultationDetail(consultation);
}

async function getConsultationForMutation(session: SessionLike, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({
    where: {
      consultation_id: consultationId,
    },
    include: {
      survey: {
        select: {
          survey_id: true,
          status: true,
        },
      },
      deal: {
        select: {
          deal_id: true,
          assigned_manager_id: true,
          lead_id: true,
        },
      },
      lead: {
        select: {
          lead_id: true,
          assigned_manager_id: true,
        },
      },
      calendar_event: {
        select: {
          calendar_event_id: true,
        },
      },
    },
  });

  if (!consultation || !canAccessConsultation(session, consultation)) {
    return null;
  }

  return consultation;
}

export async function createConsultation(
  actorUserId: string,
  input: {
    title: string;
    assigned_consultant_id: string;
    assigned_manager_id?: string | null;
    lead_id?: string | null;
    deal_id?: string | null;
    client_id?: string | null;
    project_id?: string | null;
    location_address?: string | null;
    manager_notes?: string | null;
    scheduled_start_at: string;
    scheduled_end_at: string;
  },
) {
  const [eventTypeId, eventTrackId] = await Promise.all([
    getEventTypeId("CONSULTATION"),
    getEventTrackId("SURVEY"),
  ]);

  if (!eventTypeId) {
    throw new Error("CONSULTATION event type is not configured.");
  }

  const title = input.title.trim();
  const startsAt = new Date(input.scheduled_start_at);
  const endsAt = new Date(input.scheduled_end_at);

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        event_type_id: eventTypeId,
        event_track_id: eventTrackId,
        lead_id: input.lead_id ?? null,
        deal_id: input.deal_id ?? null,
        project_id: input.project_id ?? null,
        assigned_user_id: input.assigned_consultant_id,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "scheduled",
        color_token: "yellow",
        metadata: {
          context: "consultation",
        },
      },
    });

    const consultation = await tx.consultation.create({
      data: {
        calendar_event_id: event.calendar_event_id,
        lead_id: input.lead_id ?? null,
        deal_id: input.deal_id ?? null,
        client_id: input.client_id ?? null,
        project_id: input.project_id ?? null,
        assigned_consultant_id: input.assigned_consultant_id,
        assigned_manager_id: input.assigned_manager_id ?? actorUserId,
        created_by: actorUserId,
        title,
        location_address: input.location_address ?? null,
        scheduled_start_at: startsAt,
        scheduled_end_at: endsAt,
        manager_notes: input.manager_notes ?? null,
        status: "scheduled",
      },
    });

    await tx.survey.create({
      data: {
        consultation_id: consultation.consultation_id,
        status: "draft",
      },
    });

    await onConsultationScheduled(tx, {
      actorUserId,
      consultationId: consultation.consultation_id,
      consultationTitle: consultation.title,
      leadId: input.lead_id ?? null,
      dealId: input.deal_id ?? null,
      consultantUserId: input.assigned_consultant_id,
      scheduledStartAt: startsAt,
    });

    return consultation;
  });

  await logConsultationActivity({
    actorUserId,
    entityType: "consultation",
    entityId: result.consultation_id,
    actionKey: "consultation.created",
    message: `Назначена консультация ${title}.`,
    metadata: {
      assigned_consultant_id: input.assigned_consultant_id,
      scheduled_start_at: input.scheduled_start_at,
      scheduled_end_at: input.scheduled_end_at,
    },
  });

  return result;
}

export async function updateConsultation(
  session: SessionLike,
  consultationId: string,
  input: {
    title?: string;
    location_address?: string | null;
    scheduled_start_at?: string;
    scheduled_end_at?: string;
    manager_notes?: string | null;
    consultant_notes?: string | null;
    assigned_consultant_id?: string | null;
    assigned_manager_id?: string | null;
    status?: string;
  },
) {
  const consultation = await getConsultationForMutation(session, consultationId);

  if (!consultation) {
    return null;
  }

  const managerEditor = isOwner(session) || isManager(session);
  const data: Record<string, unknown> = {};
  const eventData: Record<string, unknown> = {};

  if (input.title !== undefined && managerEditor) {
    data.title = input.title.trim();
    eventData.title = input.title.trim();
  }

  if (input.location_address !== undefined && managerEditor) {
    data.location_address = input.location_address;
  }

  if (input.scheduled_start_at && managerEditor) {
    data.scheduled_start_at = new Date(input.scheduled_start_at);
    eventData.starts_at = new Date(input.scheduled_start_at);
  }

  if (input.scheduled_end_at && managerEditor) {
    data.scheduled_end_at = new Date(input.scheduled_end_at);
    eventData.ends_at = new Date(input.scheduled_end_at);
  }

  if (input.manager_notes !== undefined && managerEditor) {
    data.manager_notes = input.manager_notes;
  }

  if (input.consultant_notes !== undefined) {
    data.consultant_notes = input.consultant_notes;
  }

  if (input.assigned_consultant_id !== undefined && managerEditor) {
    data.assigned_consultant_id = input.assigned_consultant_id;
    eventData.assigned_user_id = input.assigned_consultant_id;
  }

  if (input.assigned_manager_id !== undefined && managerEditor) {
    data.assigned_manager_id = input.assigned_manager_id;
  }

  if (input.status !== undefined) {
    data.status = input.status;
    eventData.status = input.status;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextConsultation = await tx.consultation.update({
      where: {
        consultation_id: consultationId,
      },
      data,
    });

    if (consultation.calendar_event?.calendar_event_id && Object.keys(eventData).length > 0) {
      await tx.calendarEvent.update({
        where: {
          calendar_event_id: consultation.calendar_event.calendar_event_id,
        },
        data: eventData,
      });
    }

    return nextConsultation;
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "consultation",
    entityId: consultationId,
    actionKey: "consultation.updated",
    message: `Карточка консультации ${updated.title} обновлена.`,
  });

  return updated;
}

export async function updateSurveyForm(
  session: SessionLike,
  consultationId: string,
  input: {
    summary_notes?: string | null;
    electrical_notes?: string | null;
    smart_recommended?: boolean;
    solar_recommended?: boolean;
    safety_recommended?: boolean;
    status?: string;
  },
) {
  const consultation = await getConsultationForMutation(session, consultationId);

  if (!consultation?.survey) {
    return null;
  }

  const survey = await prisma.survey.update({
    where: {
      survey_id: consultation.survey.survey_id,
    },
    data: {
      summary_notes: input.summary_notes !== undefined ? input.summary_notes : undefined,
      electrical_notes: input.electrical_notes !== undefined ? input.electrical_notes : undefined,
      smart_recommended: input.smart_recommended !== undefined ? input.smart_recommended : undefined,
      solar_recommended: input.solar_recommended !== undefined ? input.solar_recommended : undefined,
      safety_recommended: input.safety_recommended !== undefined ? input.safety_recommended : undefined,
      status: input.status ?? undefined,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "survey",
    entityId: survey.survey_id,
    actionKey: "survey.updated",
    message: "Survey form updated.",
    metadata: {
      consultation_id: consultationId,
    },
  });

  return survey;
}

export async function addMeasurement(
  session: SessionLike,
  consultationId: string,
  input: {
    room_name: string;
    office_name?: string | null;
    zone_name?: string | null;
    floor?: string | null;
    window_id?: string | null;
    width?: number | null;
    height?: number | null;
    sqft?: number | null;
    quantity?: number | null;
    glass_type?: string | null;
    orientation?: string | null;
    access_type?: string | null;
    complexity_level_id?: string | null;
    notes?: string | null;
    drawing_data?: Prisma.InputJsonValue | null;
    sort_order?: number;
  },
) {
  const consultation = await getConsultationForMutation(session, consultationId);

  if (!consultation?.survey) {
    return null;
  }

  const width = input.width ?? null;
  const height = input.height ?? null;
  const sqft = input.sqft ?? calculateSqft(width, height);
  const quantity = normalizeQuantity(input.quantity);

  const measurement = await prisma.measurement.create({
    data: {
      survey_id: consultation.survey.survey_id,
      room_name: input.room_name.trim(),
      office_name: input.office_name ?? null,
      zone_name: input.zone_name ?? null,
      floor: input.floor ?? null,
      window_id: input.window_id ?? null,
      width,
      height,
      sqft,
      quantity,
      glass_type: input.glass_type ?? null,
      orientation: input.orientation ?? null,
      access_type: input.access_type ?? null,
      complexity_level_id: input.complexity_level_id ?? null,
      notes: input.notes ?? null,
      drawing_data: nullableJson(input.drawing_data),
      sort_order: input.sort_order ?? 0,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "measurement",
    entityId: measurement.measurement_id,
    actionKey: "measurement.created",
    message: `Добавлен замер для комнаты ${measurement.room_name}.`,
    metadata: {
      consultation_id: consultationId,
      survey_id: consultation.survey.survey_id,
    },
  });

  return measurement;
}

export async function updateMeasurement(
  session: SessionLike,
  measurementId: string,
  input: {
    room_name?: string;
    office_name?: string | null;
    zone_name?: string | null;
    floor?: string | null;
    window_id?: string | null;
    width?: number | null;
    height?: number | null;
    sqft?: number | null;
    quantity?: number | null;
    glass_type?: string | null;
    orientation?: string | null;
    access_type?: string | null;
    complexity_level_id?: string | null;
    notes?: string | null;
    drawing_data?: Prisma.InputJsonValue | null;
    sort_order?: number;
  },
) {
  const measurement = await prisma.measurement.findUnique({
    where: {
      measurement_id: measurementId,
    },
    include: {
      survey: {
        include: {
          consultation: true,
        },
      },
    },
  });

  if (!measurement || !canAccessConsultation(session, measurement.survey.consultation)) {
    return null;
  }

  const width = input.width !== undefined ? input.width : measurement.width ? Number(measurement.width.toString()) : null;
  const height = input.height !== undefined ? input.height : measurement.height ? Number(measurement.height.toString()) : null;
  const sqft =
    input.sqft !== undefined
      ? input.sqft
      : input.width !== undefined || input.height !== undefined
        ? calculateSqft(width, height)
        : undefined;
  const quantity = input.quantity !== undefined ? normalizeQuantity(input.quantity) : undefined;

  const updated = await prisma.measurement.update({
    where: {
      measurement_id: measurementId,
    },
    data: {
      room_name: input.room_name?.trim() || undefined,
      office_name: input.office_name !== undefined ? input.office_name : undefined,
      zone_name: input.zone_name !== undefined ? input.zone_name : undefined,
      floor: input.floor !== undefined ? input.floor : undefined,
      window_id: input.window_id !== undefined ? input.window_id : undefined,
      width: input.width !== undefined ? input.width : undefined,
      height: input.height !== undefined ? input.height : undefined,
      sqft,
      quantity,
      glass_type: input.glass_type !== undefined ? input.glass_type : undefined,
      orientation: input.orientation !== undefined ? input.orientation : undefined,
      access_type: input.access_type !== undefined ? input.access_type : undefined,
      complexity_level_id:
        input.complexity_level_id !== undefined ? input.complexity_level_id : undefined,
      notes: input.notes !== undefined ? input.notes : undefined,
      drawing_data: nullableJson(input.drawing_data),
      sort_order: input.sort_order !== undefined ? input.sort_order : undefined,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "measurement",
    entityId: updated.measurement_id,
    actionKey: "measurement.updated",
    message: `Обновлен замер для комнаты ${updated.room_name}.`,
  });

  return updated;
}

export async function addSurveyRecommendation(
  session: SessionLike,
  consultationId: string,
  input: {
    measurement_id?: string | null;
    service_type_id: string;
    film_id?: string | null;
    is_primary?: boolean;
    sort_order?: number;
    recommendation_notes?: string | null;
    electrical_notes?: string | null;
  },
) {
  const consultation = await getConsultationForMutation(session, consultationId);

  if (!consultation?.survey) {
    return null;
  }

  const recommendation = await prisma.surveyRecommendation.create({
    data: {
      survey_id: consultation.survey.survey_id,
      measurement_id: input.measurement_id ?? null,
      service_type_id: input.service_type_id,
      film_id: input.film_id ?? null,
      is_primary: input.is_primary ?? false,
      sort_order: input.sort_order ?? 0,
      recommendation_notes: input.recommendation_notes ?? null,
      electrical_notes: input.electrical_notes ?? null,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "survey_recommendation",
    entityId: recommendation.survey_recommendation_id,
    actionKey: "survey.recommendation.created",
    message: "Добавлена film recommendation.",
    metadata: {
      consultation_id: consultationId,
      survey_id: consultation.survey.survey_id,
    },
  });

  return recommendation;
}

export async function updateSurveyRecommendation(
  session: SessionLike,
  recommendationId: string,
  input: {
    measurement_id?: string | null;
    service_type_id?: string;
    film_id?: string | null;
    is_primary?: boolean;
    sort_order?: number;
    recommendation_notes?: string | null;
    electrical_notes?: string | null;
  },
) {
  const recommendation = await prisma.surveyRecommendation.findUnique({
    where: {
      survey_recommendation_id: recommendationId,
    },
    include: {
      survey: {
        include: {
          consultation: true,
        },
      },
    },
  });

  if (!recommendation || !canAccessConsultation(session, recommendation.survey.consultation)) {
    return null;
  }

  const updated = await prisma.surveyRecommendation.update({
    where: {
      survey_recommendation_id: recommendationId,
    },
    data: {
      measurement_id: input.measurement_id !== undefined ? input.measurement_id : undefined,
      service_type_id: input.service_type_id ?? undefined,
      film_id: input.film_id !== undefined ? input.film_id : undefined,
      is_primary: input.is_primary !== undefined ? input.is_primary : undefined,
      sort_order: input.sort_order !== undefined ? input.sort_order : undefined,
      recommendation_notes:
        input.recommendation_notes !== undefined ? input.recommendation_notes : undefined,
      electrical_notes: input.electrical_notes !== undefined ? input.electrical_notes : undefined,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "survey_recommendation",
    entityId: updated.survey_recommendation_id,
    actionKey: "survey.recommendation.updated",
    message: "Обновлена film recommendation.",
  });

  return updated;
}

export async function addSurveyPhoto(
  session: SessionLike,
  consultationId: string,
  input: {
    survey_id?: string | null;
    measurement_id?: string | null;
    file_type: string;
    original_name: string;
    file_url: string;
    mime_type?: string | null;
    size_bytes?: number | null;
    storage_provider?: string;
    storage_bucket?: string | null;
    storage_key: string;
  },
) {
  const consultation = await getConsultationForMutation(session, consultationId);

  if (!consultation?.survey) {
    return null;
  }

  const file = await prisma.attachmentFile.create({
    data: {
      lead_id: consultation.lead?.lead_id ?? null,
      deal_id: consultation.deal?.deal_id ?? null,
      consultation_id: consultation.consultation_id,
      survey_id: input.survey_id ?? consultation.survey.survey_id,
      measurement_id: input.measurement_id ?? null,
      calendar_event_id: consultation.calendar_event?.calendar_event_id ?? null,
      uploaded_by: session.user.user_id,
      file_type: input.file_type,
      original_name: input.original_name,
      storage_provider: input.storage_provider ?? "manual",
      storage_bucket: input.storage_bucket ?? null,
      storage_key: input.storage_key,
      file_url: input.file_url,
      mime_type: input.mime_type ?? null,
      size_bytes: input.size_bytes ?? null,
    },
  });

  await logConsultationActivity({
    actorUserId: session.user.user_id,
    entityType: "attachment_file",
    entityId: file.file_id,
    actionKey: "survey.photo.uploaded",
    message: `Загружен файл ${file.original_name}.`,
    metadata: {
      consultation_id: consultationId,
      survey_id: consultation.survey.survey_id,
      measurement_id: input.measurement_id ?? null,
      file_type: input.file_type,
    },
  });

  return file;
}

export async function completeSurvey(session: SessionLike, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({
    where: {
      consultation_id: consultationId,
    },
    include: {
      survey: {
        include: {
          measurements: {
            select: {
              measurement_id: true,
            },
          },
          recommendations: {
            select: {
              survey_recommendation_id: true,
            },
          },
        },
      },
      calendar_event: {
        select: {
          calendar_event_id: true,
        },
      },
      lead: {
        select: {
          lead_id: true,
          assigned_manager_id: true,
        },
      },
      deal: {
        select: {
          deal_id: true,
          assigned_manager_id: true,
        },
      },
      assigned_manager: {
        select: {
          user_id: true,
        },
      },
    },
  });

  if (!consultation || !canAccessConsultation(session, consultation) || !consultation.survey) {
    return null;
  }

  const now = new Date();
  const alreadyCompleted =
    consultation.status === "completed" && consultation.survey.status === "completed";

  if (!alreadyCompleted) {
    await prisma.$transaction(async (tx) => {
      await tx.survey.update({
        where: {
          survey_id: consultation.survey!.survey_id,
        },
        data: {
          status: "completed",
          completed_at: now,
        },
      });

      await tx.consultation.update({
        where: {
          consultation_id: consultationId,
        },
        data: {
          status: "completed",
          completed_at: now,
        },
      });

      if (consultation.calendar_event?.calendar_event_id) {
        await tx.calendarEvent.update({
          where: {
            calendar_event_id: consultation.calendar_event.calendar_event_id,
          },
          data: {
            status: "completed",
          },
        });
      }

      await onSurveyCompleted(tx, {
        actorUserId: session.user.user_id,
        consultationId,
        surveyId: consultation.survey!.survey_id,
        leadId: consultation.lead?.lead_id ?? null,
        dealId: consultation.deal?.deal_id ?? null,
        managerUserId:
          consultation.assigned_manager?.user_id ??
          consultation.deal?.assigned_manager_id ??
          consultation.lead?.assigned_manager_id ??
          null,
      });
    });

    await logConsultationActivity({
      actorUserId: session.user.user_id,
      entityType: "survey",
      entityId: consultation.survey.survey_id,
      actionKey: "survey.completed",
      message: "Survey завершен, менеджер уведомлен.",
      metadata: {
        consultation_id: consultationId,
        measurements_count: consultation.survey.measurements.length,
        recommendations_count: consultation.survey.recommendations.length,
      },
    });
  }

  return {
    consultation_id: consultationId,
    survey_id: consultation.survey.survey_id,
    completed_at: now,
  };
}
