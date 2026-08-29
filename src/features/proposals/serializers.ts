import { getEnv } from "@/lib/env";

function toNumber(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

function buildPublicUrl(accessToken: string) {
  return `${getEnv().appUrl.replace(/\/$/, "")}/proposal/${accessToken}`;
}

function serializeProposalItemInternal(item: any) {
  return {
    proposal_item_id: item.proposal_item_id,
    item_kind: item.item_kind,
    room_name: item.room_name,
    zone_name: item.zone_name,
    window_id: item.window_id,
    title_ru: item.title_ru,
    title_en: item.title_en,
    description_ru: item.description_ru,
    description_en: item.description_en,
    measurement_snapshot: item.measurement_snapshot,
    dynamic_fields: item.dynamic_fields,
    addons_snapshot: item.addons_snapshot,
    quantity: toNumber(item.quantity),
    unit_label: item.unit_label,
    line_price: toNumber(item.line_price),
    is_optional: item.is_optional,
    client_selected: item.client_selected,
    selection_updated_at: item.selection_updated_at,
    sort_order: item.sort_order,
    measurement: item.measurement
      ? {
          measurement_id: item.measurement.measurement_id,
          room_name: item.measurement.room_name,
          office_name: item.measurement.office_name,
          zone_name: item.measurement.zone_name,
          floor: item.measurement.floor,
          window_id: item.measurement.window_id,
          width: toNumber(item.measurement.width),
          height: toNumber(item.measurement.height),
          sqft: toNumber(item.measurement.sqft),
          quantity: toNumber(item.measurement.quantity),
          glass_type: item.measurement.glass_type,
          orientation: item.measurement.orientation,
          access_type: item.measurement.access_type,
          notes: item.measurement.notes,
        }
      : null,
    service_type: item.service_type
      ? {
          service_type_id: item.service_type.service_type_id,
          service_code: item.service_type.service_code,
          name_ru: item.service_type.name_ru,
          name_en: item.service_type.name_en,
        }
      : null,
    film: item.film
      ? {
          film_id: item.film.film_id,
          category_name_ru: item.film.category_name_ru,
          category_name_en: item.film.category_name_en,
          brand_name_ru: item.film.brand_name_ru,
          brand_name_en: item.film.brand_name_en,
          model_name_ru: item.film.model_name_ru,
          model_name_en: item.film.model_name_en,
          thickness: item.film.thickness,
          // Характеристики хранились в базе, но до клиента не доходили —
          // предложение на десятки тысяч выглядело голым списком строк.
          vlt_percent: toNumber(item.film.vlt_percent),
          uv_rejection_percent: toNumber(item.film.uv_rejection_percent),
          ir_rejection_percent: toNumber(item.film.ir_rejection_percent),
          tser_percent: toNumber(item.film.tser_percent),
        }
      : null,
  };
}

function serializeDepositInternal(deposit: any) {
  if (!deposit) {
    return null;
  }

  return {
    deposit_id: deposit.deposit_id,
    amount: toNumber(deposit.amount),
    status: deposit.status,
    paid_at: deposit.paid_at,
    created_at: deposit.created_at,
    updated_at: deposit.updated_at,
  };
}

export function serializeProposalListItem(proposal: any) {
  return {
    proposal_id: proposal.proposal_id,
    proposal_code: proposal.proposal_code,
    title: proposal.title,
    status: proposal.status,
    currency: proposal.currency,
    subtotal_amount: toNumber(proposal.subtotal_amount),
    selected_total_amount: toNumber(proposal.selected_total_amount),
    sent_at: proposal.sent_at,
    client_viewed_at: proposal.client_viewed_at,
    client_updated_at: proposal.client_updated_at,
    public_url: buildPublicUrl(proposal.access_token),
    deal: proposal.deal
      ? {
          deal_id: proposal.deal.deal_id,
          deal_code: proposal.deal.deal_code,
          title: proposal.deal.title,
          pipeline_status: proposal.deal.pipeline_status
            ? {
                status_code: proposal.deal.pipeline_status.status_code,
                name_ru: proposal.deal.pipeline_status.name_ru,
                color_token: proposal.deal.pipeline_status.color_token,
              }
            : null,
        }
      : null,
    client: proposal.client
      ? {
          client_id: proposal.client.client_id,
          name: proposal.client.name,
          email: proposal.client.email,
        }
      : null,
    items_count: proposal._count?.proposal_items ?? proposal.proposal_items?.length ?? 0,
    agreement_status: proposal.agreement?.status ?? null,
    deposit: serializeDepositInternal(proposal.deposit),
    project: proposal.project
      ? {
          project_id: proposal.project.project_id,
          project_code: proposal.project.project_code,
          title: proposal.project.title,
        }
      : null,
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
  };
}

export function serializeProposalDetail(proposal: any) {
  return {
    proposal_id: proposal.proposal_id,
    proposal_code: proposal.proposal_code,
    title: proposal.title,
    status: proposal.status,
    currency: proposal.currency,
    subtotal_amount: toNumber(proposal.subtotal_amount),
    selected_total_amount: toNumber(proposal.selected_total_amount),
    client_message: proposal.client_message,
    notes: proposal.notes,
    sent_at: proposal.sent_at,
    client_viewed_at: proposal.client_viewed_at,
    client_updated_at: proposal.client_updated_at,
    expires_at: proposal.expires_at,
    public_url: buildPublicUrl(proposal.access_token),
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
    deal: proposal.deal
      ? {
          deal_id: proposal.deal.deal_id,
          deal_code: proposal.deal.deal_code,
          title: proposal.deal.title,
          estimated_value: toNumber(proposal.deal.estimated_value),
          currency: proposal.deal.currency,
          pipeline_status: proposal.deal.pipeline_status
            ? {
                status_code: proposal.deal.pipeline_status.status_code,
                name_ru: proposal.deal.pipeline_status.name_ru,
                name_en: proposal.deal.pipeline_status.name_en,
                color_token: proposal.deal.pipeline_status.color_token,
              }
            : null,
          assigned_manager: proposal.deal.assigned_manager
            ? {
                user_id: proposal.deal.assigned_manager.user_id,
                full_name: proposal.deal.assigned_manager.full_name,
                email: proposal.deal.assigned_manager.email,
              }
            : null,
        }
      : null,
    client: proposal.client
      ? {
          client_id: proposal.client.client_id,
          client_code: proposal.client.client_code,
          name: proposal.client.name,
          phone: proposal.client.phone,
          email: proposal.client.email,
          service_address: proposal.client.service_address,
        }
      : null,
    survey: proposal.survey
      ? {
          survey_id: proposal.survey.survey_id,
          status: proposal.survey.status,
          consultation: proposal.survey.consultation
            ? {
                consultation_id: proposal.survey.consultation.consultation_id,
                title: proposal.survey.consultation.title,
                scheduled_start_at: proposal.survey.consultation.scheduled_start_at,
              }
            : null,
        }
      : null,
    created_by: proposal.created_by_user
      ? {
          user_id: proposal.created_by_user.user_id,
          full_name: proposal.created_by_user.full_name,
          email: proposal.created_by_user.email,
        }
      : null,
    items: (proposal.proposal_items ?? []).map(serializeProposalItemInternal),
    events: (proposal.proposal_events ?? []).map((event: any) => ({
      proposal_event_id: event.proposal_event_id,
      event_key: event.event_key,
      actor_type: event.actor_type,
      message: event.message,
      metadata: event.metadata,
      created_at: event.created_at,
      actor_user: event.actor_user
        ? {
            user_id: event.actor_user.user_id,
            full_name: event.actor_user.full_name,
          }
        : null,
    })),
    agreement: proposal.agreement
      ? {
          agreement_id: proposal.agreement.agreement_id,
          status: proposal.agreement.status,
          signer_name: proposal.agreement.signer_name,
          signer_email: proposal.agreement.signer_email,
          signer_title: proposal.agreement.signer_title,
          client_notes: proposal.agreement.client_notes,
          accepted_terms: proposal.agreement.accepted_terms,
          signed_at: proposal.agreement.signed_at,
        }
      : null,
    deposit: serializeDepositInternal(proposal.deposit),
    project: proposal.project
      ? {
          project_id: proposal.project.project_id,
          project_code: proposal.project.project_code,
          title: proposal.project.title,
          project_status: proposal.project.project_status
            ? {
                status_code: proposal.project.project_status.status_code,
                name_ru: proposal.project.project_status.name_ru,
              }
            : null,
          payment_status: proposal.project.payment_status
            ? {
                status_code: proposal.project.payment_status.status_code,
                name_ru: proposal.project.payment_status.name_ru,
              }
            : null,
        }
      : null,
  };
}

export function serializePublicProposal(proposal: any) {
  return {
    proposal_id: proposal.proposal_id,
    proposal_code: proposal.proposal_code,
    proposal_number: proposal.proposal_code,
    title: proposal.title,
    status: proposal.status,
    currency: proposal.currency,
    subtotal_amount: toNumber(proposal.subtotal_amount),
    selected_total_amount: toNumber(proposal.selected_total_amount),
    client_message: proposal.client_message,
    sent_at: proposal.sent_at,
    client_viewed_at: proposal.client_viewed_at,
    client_updated_at: proposal.client_updated_at,
    expires_at: proposal.expires_at,
    client: proposal.client
      ? {
          client_id: proposal.client.client_id,
          name: proposal.client.name,
          email: proposal.client.email,
          service_address: proposal.client.service_address,
        }
      : null,
    deal: proposal.deal
      ? {
          deal_id: proposal.deal.deal_id,
          title: proposal.deal.title,
        }
      : null,
    items: (proposal.proposal_items ?? []).map((item: any) => ({
      proposal_item_id: item.proposal_item_id,
      item_kind: item.item_kind,
      room_name: item.room_name,
      zone_name: item.zone_name,
      window_id: item.window_id,
      title: item.title_en,
      description: item.description_en,
      dynamic_fields: item.dynamic_fields,
      addons_snapshot: item.addons_snapshot,
      quantity: toNumber(item.quantity),
      unit_label: item.unit_label,
      line_price: toNumber(item.line_price),
      is_optional: item.is_optional,
      client_selected: item.client_selected,
      measurement: item.measurement
        ? {
            room_name: item.measurement.room_name,
            office_name: item.measurement.office_name,
            zone_name: item.measurement.zone_name,
            floor: item.measurement.floor,
            window_id: item.measurement.window_id,
            width: toNumber(item.measurement.width),
            height: toNumber(item.measurement.height),
            sqft: toNumber(item.measurement.sqft),
            glass_type: item.measurement.glass_type,
            orientation: item.measurement.orientation,
            access_type: item.measurement.access_type,
          }
        : null,
      service_type: item.service_type
        ? {
            service_code: item.service_type.service_code,
            name: item.service_type.name_en,
          }
        : null,
      film: item.film
        ? {
            category_name: item.film.category_name_en,
            brand_name: item.film.brand_name_en,
            model_name: item.film.model_name_en,
            thickness: item.film.thickness,
          }
        : null,
    })),
    agreement: proposal.agreement
      ? {
          agreement_id: proposal.agreement.agreement_id,
          status: proposal.agreement.status,
          signer_name: proposal.agreement.signer_name,
          signer_email: proposal.agreement.signer_email,
          signer_title: proposal.agreement.signer_title,
          client_notes: proposal.agreement.client_notes,
          accepted_terms: proposal.agreement.accepted_terms,
          signed_at: proposal.agreement.signed_at,
        }
      : null,
  };
}
