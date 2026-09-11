import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope, getPipelineStatusId } from "@/features/sales/api";
import { getRecordManagerScope, isCrossManagerAssignment } from "@/features/sales/access";
import { listLeads } from "@/features/sales/service";
import { onLeadCreated } from "@/features/core/events";
import { persistLeadAttribution } from "@/features/google-ads/attribution";
import type { AttributionCaptureInput, ConsentState } from "@/features/google-ads/types";

type ApiAttributionInput = {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  landing_page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  session_attributes?: Record<string, unknown> | null;
  captured_at?: string | null;
  consent?: {
    ad_user_data?: ConsentState | string | null;
    ad_personalization?: ConsentState | string | null;
    audience_marketing_eligible?: boolean | null;
    source?: string | null;
    policy_version?: string | null;
    effective_at?: string | null;
  } | null;
};

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAttributionCaptureInput(input: ApiAttributionInput | null | undefined): AttributionCaptureInput | null {
  if (!input) return null;

  return {
    gclid: input.gclid,
    gbraid: input.gbraid,
    wbraid: input.wbraid,
    landingPage: input.landing_page,
    utmSource: input.utm_source,
    utmMedium: input.utm_medium,
    utmCampaign: input.utm_campaign,
    utmTerm: input.utm_term,
    utmContent: input.utm_content,
    sessionAttributes: input.session_attributes,
    capturedAt: parseOptionalDate(input.captured_at),
    consent: input.consent
      ? {
          adUserData: (input.consent.ad_user_data ?? "UNKNOWN") as ConsentState,
          adPersonalization: (input.consent.ad_personalization ?? "UNKNOWN") as ConsentState,
          audienceMarketingEligible: input.consent.audience_marketing_eligible === true,
          source: input.consent.source?.trim() || "unspecified",
          policyVersion: input.consent.policy_version,
          effectiveAt: parseOptionalDate(input.consent.effective_at),
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Leads access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await listLeads(managerId);

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Lead creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        phone?: string;
        email?: string;
        source?: string;
        notes?: string;
        city_id?: string;
        assigned_manager_id?: string;
        pipeline_status_code?: string;
        attribution?: ApiAttributionInput | null;
      }
    | null;

  if (!body?.name?.trim()) {
    return apiError(400, "invalid_payload", "Lead name is required.");
  }

  const recordManagerId = getRecordManagerScope(auth.session);

  if (isCrossManagerAssignment(recordManagerId, body.assigned_manager_id)) {
    return apiError(403, "forbidden", "Managers cannot assign leads to another user.");
  }

  const trimmedName = body.name.trim();

  const pipelineStatus =
    (body.pipeline_status_code ? await getPipelineStatusId(body.pipeline_status_code) : null) ??
    (await getPipelineStatusId("NEW_LEAD"));

  if (!pipelineStatus) {
    return apiError(500, "missing_pipeline_status", "Default pipeline status is not configured.");
  }

  const assignedManagerId = recordManagerId ?? body.assigned_manager_id ?? null;
  const attribution = toAttributionCaptureInput(body.attribution);

  const lead = await prisma.$transaction(async (tx) => {
    const createdLead = await tx.lead.create({
      data: {
        name: trimmedName,
        phone: body.phone?.trim() || null,
        email: body.email?.trim().toLowerCase() || null,
        source: body.source?.trim() || null,
        notes: body.notes?.trim() || null,
        city_id: body.city_id ?? null,
        assigned_manager_id: assignedManagerId,
        pipeline_status_id: pipelineStatus.pipeline_status_id,
      },
    });

    // Attribution and consent become part of the accepted CRM lead atomically.
    // A rejected/rolled-back lead cannot leave orphaned Google matching data behind.
    await persistLeadAttribution(tx, createdLead.lead_id, attribution);

    if (pipelineStatus.status_code === "NEW_LEAD" || pipelineStatus.status_code === "LEAD") {
      await onLeadCreated(tx, {
        actorUserId: auth.session.user.user_id,
        leadId: createdLead.lead_id,
        managerUserId: assignedManagerId,
        leadNameOrTitle: createdLead.name,
      });
    }

    return createdLead;
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "lead",
    entityId: lead.lead_id,
    actionKey: "lead.created",
    message: `Создан лид ${lead.name}.`,
    metadata: {
      pipeline_status_code: pipelineStatus.status_code,
    },
  });

  return apiSuccess({
    lead_id: lead.lead_id,
  });
}
