function toNumber(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : null;
}

export function serializeMeasurement(
  measurement: {
    measurement_id: string;
    room_name: string;
    office_name: string | null;
    zone_name: string | null;
    floor: string | null;
    window_id: string | null;
    width: { toString(): string } | null;
    height: { toString(): string } | null;
    sqft: { toString(): string } | null;
    quantity: { toString(): string } | null;
    glass_type: string | null;
    orientation: string | null;
    access_type: string | null;
    notes: string | null;
    drawing_data: unknown;
    sort_order: number;
    complexity_level:
      | {
          complexity_level_id: string;
          level_code: string;
          name_ru: string;
          name_en: string;
          color_token: string | null;
        }
      | null;
    attachments_files?: Array<{
      file_id: string;
      file_type: string;
      original_name: string;
      file_url: string;
      created_at: Date;
    }>;
  },
) {
  return {
    measurement_id: measurement.measurement_id,
    room_name: measurement.room_name,
    office_name: measurement.office_name,
    zone_name: measurement.zone_name,
    floor: measurement.floor,
    window_id: measurement.window_id,
    width: toNumber(measurement.width),
    height: toNumber(measurement.height),
    sqft: toNumber(measurement.sqft),
    quantity: toNumber(measurement.quantity) || 1,
    glass_type: measurement.glass_type,
    orientation: measurement.orientation,
    access_type: measurement.access_type,
    notes: measurement.notes,
    drawing_data: measurement.drawing_data,
    sort_order: measurement.sort_order,
    complexity_level: measurement.complexity_level,
    photos:
      measurement.attachments_files?.map((file) => ({
        file_id: file.file_id,
        file_type: file.file_type,
        original_name: file.original_name,
        file_url: file.file_url,
        created_at: file.created_at,
      })) ?? [],
  };
}

export function serializeSurveyRecommendation(
  recommendation: {
    survey_recommendation_id: string;
    is_primary: boolean;
    sort_order: number;
    recommendation_notes: string | null;
    electrical_notes: string | null;
    measurement:
      | {
          measurement_id: string;
          room_name: string;
          window_id: string | null;
        }
      | null;
    service_type: {
      service_type_id: string;
      service_code: string;
      name_ru: string;
      name_en: string;
    };
    film:
      | {
          film_id: string;
          category_name_ru: string;
          category_name_en: string;
          brand_name_ru: string;
          brand_name_en: string;
          model_name_ru: string;
          model_name_en: string;
          thickness: string | null;
        }
      | null;
  },
) {
  return {
    survey_recommendation_id: recommendation.survey_recommendation_id,
    is_primary: recommendation.is_primary,
    sort_order: recommendation.sort_order,
    recommendation_notes: recommendation.recommendation_notes,
    electrical_notes: recommendation.electrical_notes,
    measurement: recommendation.measurement,
    service_type: recommendation.service_type,
    film: recommendation.film,
  };
}

export function serializeAttachmentFile(
  file: {
    file_id: string;
    file_type: string;
    original_name: string;
    file_url: string;
    mime_type: string | null;
    size_bytes: bigint | null;
    created_at: Date;
  },
) {
  return {
    file_id: file.file_id,
    file_type: file.file_type,
    original_name: file.original_name,
    file_url: file.file_url,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes ? Number(file.size_bytes) : null,
    created_at: file.created_at,
  };
}

export function serializeConsultationListItem(
  consultation: {
    consultation_id: string;
    title: string;
    status: string;
    location_address: string | null;
    scheduled_start_at: Date;
    scheduled_end_at: Date;
    manager_notes: string | null;
    lead: { lead_id: string; lead_code: string | null; name: string } | null;
    deal: { deal_id: string; deal_code: string | null; title: string } | null;
    client: { client_id: string; client_code: string | null; name: string; phone: string | null } | null;
    assigned_consultant: { user_id: string; full_name: string };
    assigned_manager: { user_id: string; full_name: string } | null;
    survey:
      | {
          survey_id: string;
          status: string;
          completed_at: Date | null;
          _count?: {
            measurements: number;
            recommendations: number;
            attachments_files: number;
          };
        }
      | null;
  },
) {
  return {
    consultation_id: consultation.consultation_id,
    title: consultation.title,
    status: consultation.status,
    location_address: consultation.location_address,
    scheduled_start_at: consultation.scheduled_start_at,
    scheduled_end_at: consultation.scheduled_end_at,
    manager_notes: consultation.manager_notes,
    lead: consultation.lead,
    deal: consultation.deal,
    client: consultation.client,
    assigned_consultant: consultation.assigned_consultant,
    assigned_manager: consultation.assigned_manager,
    survey: consultation.survey
      ? {
          survey_id: consultation.survey.survey_id,
          status: consultation.survey.status,
          completed_at: consultation.survey.completed_at,
          counts: consultation.survey._count ?? {
            measurements: 0,
            recommendations: 0,
            attachments_files: 0,
          },
        }
      : null,
  };
}

export function serializeConsultationDetail(
  consultation: {
    consultation_id: string;
    title: string;
    status: string;
    location_address: string | null;
    scheduled_start_at: Date;
    scheduled_end_at: Date;
    manager_notes: string | null;
    consultant_notes: string | null;
    completed_at: Date | null;
    lead: { lead_id: string; lead_code: string | null; name: string; phone: string | null; email: string | null } | null;
    deal: {
      deal_id: string;
      deal_code: string | null;
      title: string;
      estimated_value: { toString(): string };
      currency: string;
    } | null;
    client: {
      client_id: string;
      client_code: string | null;
      name: string;
      phone: string | null;
      email: string | null;
      service_address: string | null;
    } | null;
    assigned_consultant: { user_id: string; full_name: string; email: string };
    assigned_manager: { user_id: string; full_name: string; email: string } | null;
    calendar_event: {
      calendar_event_id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      color_token: string | null;
      event_type: { event_code: string; name_ru: string; name_en: string };
      event_track: { track_code: string; name_ru: string; name_en: string } | null;
    } | null;
    survey:
      | {
          survey_id: string;
          status: string;
          summary_notes: string | null;
          electrical_notes: string | null;
          smart_recommended: boolean;
          solar_recommended: boolean;
          safety_recommended: boolean;
          completed_at: Date | null;
          measurements: Parameters<typeof serializeMeasurement>[0][];
          recommendations: Parameters<typeof serializeSurveyRecommendation>[0][];
          attachments_files: Parameters<typeof serializeAttachmentFile>[0][];
        }
      | null;
    attachments_files: Parameters<typeof serializeAttachmentFile>[0][];
  },
) {
  return {
    consultation_id: consultation.consultation_id,
    title: consultation.title,
    status: consultation.status,
    location_address: consultation.location_address,
    scheduled_start_at: consultation.scheduled_start_at,
    scheduled_end_at: consultation.scheduled_end_at,
    manager_notes: consultation.manager_notes,
    consultant_notes: consultation.consultant_notes,
    completed_at: consultation.completed_at,
    lead: consultation.lead,
    deal: consultation.deal
      ? {
          ...consultation.deal,
          estimated_value: toNumber(consultation.deal.estimated_value),
        }
      : null,
    client: consultation.client,
    assigned_consultant: consultation.assigned_consultant,
    assigned_manager: consultation.assigned_manager,
    calendar_event: consultation.calendar_event,
    consultation_files: consultation.attachments_files.map(serializeAttachmentFile),
    survey: consultation.survey
      ? {
          survey_id: consultation.survey.survey_id,
          status: consultation.survey.status,
          summary_notes: consultation.survey.summary_notes,
          electrical_notes: consultation.survey.electrical_notes,
          smart_recommended: consultation.survey.smart_recommended,
          solar_recommended: consultation.survey.solar_recommended,
          safety_recommended: consultation.survey.safety_recommended,
          completed_at: consultation.survey.completed_at,
          measurements: consultation.survey.measurements.map(serializeMeasurement),
          recommendations: consultation.survey.recommendations.map(serializeSurveyRecommendation),
          photos: consultation.survey.attachments_files.map(serializeAttachmentFile),
        }
      : null,
  };
}
