import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES, getPipelineStatusId } from "@/features/sales/api";
import { claimableBy } from "@/features/sales/lead-claim";
import { buildLeadAccessWhere, getRecordManagerScope, isCrossManagerAssignment } from "@/features/sales/access";
import { contactTagStage, validateLeadContactTag, validateManualLeadStage, LEAD_CONTACT_TAGS, type LeadContactTagCode } from "@/features/sales/lead-stages";
import { ensureQualifiedLeadConversion } from "@/features/google-ads/conversion-events";
import { enqueueLeadStage } from "@/features/meta-capi/events";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Lead update denied.");
  }

  const { leadId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        phone?: string | null;
        email?: string | null;
        source?: string | null;
        notes?: string | null;
        city_id?: string | null;
        assigned_manager_id?: string | null;
        pipeline_status_code?: string;
        stage_reason?: string;
        /** Call outcome: REACHED / NOT_REACHED / WRONG_PHONE; null clears it. */
        contact_tag?: LeadContactTagCode | null;
        /**
         * Compare-and-set: the update applies only while the lead is in one of
         * these statuses. «Создать проект» claims an open lead this way, so a
         * double click or a second manager cannot claim it twice.
         */
        expected_status_codes?: string[];
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  if (body.pipeline_status_code !== undefined) {
    const error = validateManualLeadStage(body.pipeline_status_code, body.stage_reason);
    if (error) return apiError(400, "invalid_lead_stage", error);
    if (!Array.isArray(body.expected_status_codes) || !body.expected_status_codes.length || body.expected_status_codes.length > 30 || body.expected_status_codes.some(code => typeof code !== "string" || !code || code.length > 60)) {
      return apiError(400, "invalid_expected_status", "Обновите список лидов перед сменой этапа.");
    }
  }

  if (body.contact_tag !== undefined) {
    const error = validateLeadContactTag(body.contact_tag);
    if (error) return apiError(400, "invalid_contact_tag", error);
  }

  const managerId = getRecordManagerScope(auth.session);

  if (isCrossManagerAssignment(managerId, body.assigned_manager_id)) {
    return apiError(403, "forbidden", "Managers cannot reassign leads to another user.");
  }

  const data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    notes?: string | null;
    city_id?: string | null;
    assigned_manager_id?: string | null;
    pipeline_status_id?: string;
    contact_tag?: string | null;
  } = {};

  if (body.name !== undefined) data.name = body.name.trim();
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim().toLowerCase() || null;
  if (body.source !== undefined) data.source = body.source?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.contact_tag !== undefined) data.contact_tag = body.contact_tag;
  if (body.city_id !== undefined) data.city_id = body.city_id;
  if (body.assigned_manager_id !== undefined) data.assigned_manager_id = body.assigned_manager_id;
  // A manager who processes a lead from the shared queue takes it over.
  else if (managerId) data.assigned_manager_id = managerId;

  if (body.pipeline_status_code) {
    const pipelineStatus = await getPipelineStatusId(body.pipeline_status_code);

    if (!pipelineStatus) {
      return apiError(400, "invalid_pipeline_status", "Pipeline status was not found.");
    }

    data.pipeline_status_id = pipelineStatus.pipeline_status_id;
  }

  const expectedStatusCodes = Array.isArray(body.expected_status_codes)
    ? body.expected_status_codes.filter((code): code is string => typeof code === "string" && code.length > 0)
    : [];

  const lead = await prisma.$transaction(async (tx) => {
    const previous = await tx.lead.findFirst({
      where: buildLeadAccessWhere(leadId, managerId),
      include: { pipeline_status: true },
    });
    if (!previous) return null;
    // A call outcome moves a fresh lead along by itself: reached → contact established, not reached → still trying.
    let stageCode = body.pipeline_status_code;
    if (body.contact_tag !== undefined && !body.pipeline_status_code) {
      const next = contactTagStage(body.contact_tag, previous.pipeline_status.status_code);
      if (next) {
        const nextStatus = await getPipelineStatusId(next);
        if (nextStatus) {
          data.pipeline_status_id = nextStatus.pipeline_status_id;
          stageCode = next;
        }
      }
    }
    if (data.pipeline_status_id && await tx.conversionEvent.count({ where: { lead_id: leadId, event_type: "converted_lead", OR: [{ conversion_value: { gt: 0 } }, { adjustments: { some: { adjustment_type: "RETRACTION" } } }] } })) {
      return "converted" as const;
    }
    const result = await tx.lead.updateMany({
      where: {
        AND: [
          buildLeadAccessWhere(leadId, managerId),
          { updated_at: previous.updated_at },
          ...(expectedStatusCodes.length
            ? [
                { pipeline_status: { status_code: { in: expectedStatusCodes } } },
                // Another manager's active «Создать проект» reservation wins.
                claimableBy(auth.session.user.user_id, new Date()),
              ]
            : []),
        ],
      },
      data,
    });

    if (result.count !== 1) return null;
    const changed = Boolean(data.pipeline_status_id && data.pipeline_status_id !== previous.pipeline_status_id);
    if (changed) {
      await ensureQualifiedLeadConversion(tx, { leadId, pipelineStatusCode: stageCode!, occurredAt: new Date() });
    }
    const tagChanged = body.contact_tag !== undefined && body.contact_tag !== previous.contact_tag;
    const tagName = LEAD_CONTACT_TAGS.find(item => item.code === body.contact_tag)?.name;
    const activity = await tx.activityLog.create({ data: {
      actor_user_id: auth.session.user.user_id,
      entity_type: "lead",
      entity_id: leadId,
      action_key: changed ? "lead.stage_changed" : tagChanged ? "lead.contact_tag_changed" : "lead.updated",
      message: [
        changed ? `Этап лида: ${previous.pipeline_status.status_code} → ${stageCode}.` : "",
        tagChanged ? (tagName ? `Дозвон: ${tagName}.` : "Отметка дозвона снята.") : "",
      ].filter(Boolean).join(" ") || "Лид обновлён.",
      metadata: {
        previous_status_code: previous.pipeline_status.status_code,
        pipeline_status_code: stageCode ?? previous.pipeline_status.status_code,
        ...(tagChanged ? { previous_contact_tag: previous.contact_tag, contact_tag: body.contact_tag } : {}),
        ...(changed && body.stage_reason?.trim() ? { reason: body.stage_reason.trim() } : {}),
      },
    } });
    if (changed) await enqueueLeadStage(tx, { leadId, stageCode: stageCode!, occurredAt: activity.created_at, eventId: activity.activity_id });
    return { lead_id: leadId };
  });

  if (lead === "converted") {
    return apiError(409, "verified_sale", "Продажа уже подтверждена. Возвраты и отмена оформляются в проекте, история продажи сохраняется.");
  }

  if (!lead) {
    const stillVisible = await prisma.lead.count({ where: buildLeadAccessWhere(leadId, managerId) });
    if (stillVisible) {
      return apiError(409, "lead_status_changed", "Заявку уже обработали — обновите список.");
    }
    return apiError(404, "not_found", "Lead was not found.");
  }

  return apiSuccess({
    lead_id: lead.lead_id,
  });
}
