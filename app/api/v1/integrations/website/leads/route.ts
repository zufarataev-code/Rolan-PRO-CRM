import { createHmac, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { persistLeadAttribution } from "@/features/google-ads/attribution";
import type { AttributionCaptureInput, ConsentState } from "@/features/google-ads/types";
import { prisma } from "@/lib/db";

const EXTERNAL_SOURCE = "rolanpro.com";
const SIGNATURE_HEADER = "x-rolan-signature";
const TIMESTAMP_HEADER = "x-rolan-timestamp";
const MAX_CLOCK_SKEW_SECONDS = 300;

type WebsiteLeadPayload = {
  submission_id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  attribution?: {
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
  } | null;
};

function error(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAttributionInput(payload: WebsiteLeadPayload["attribution"]): AttributionCaptureInput | null {
  if (!payload) return null;

  return {
    gclid: payload.gclid,
    gbraid: payload.gbraid,
    wbraid: payload.wbraid,
    landingPage: payload.landing_page,
    utmSource: payload.utm_source,
    utmMedium: payload.utm_medium,
    utmCampaign: payload.utm_campaign,
    utmTerm: payload.utm_term,
    utmContent: payload.utm_content,
    sessionAttributes: payload.session_attributes,
    capturedAt: parseOptionalDate(payload.captured_at),
    consent: payload.consent
      ? {
          adUserData: (payload.consent.ad_user_data ?? "UNKNOWN") as ConsentState,
          adPersonalization: (payload.consent.ad_personalization ?? "UNKNOWN") as ConsentState,
          audienceMarketingEligible: payload.consent.audience_marketing_eligible === true,
          source: payload.consent.source?.trim() || "website",
          policyVersion: payload.consent.policy_version,
          effectiveAt: parseOptionalDate(payload.consent.effective_at),
        }
      : null,
  };
}

function verifySignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string) {
  if (!timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature.trim().toLowerCase(), "utf8");

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function findExistingLead(submissionId: string) {
  return prisma.lead.findUnique({
    where: {
      external_source_external_submission_id: {
        external_source: EXTERNAL_SOURCE,
        external_submission_id: submissionId,
      },
    },
    select: { lead_id: true },
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBSITE_LEAD_INGEST_SECRET?.trim();
  if (!secret) {
    return error(503, "integration_not_configured", "Website lead ingestion is not configured.");
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get(TIMESTAMP_HEADER), request.headers.get(SIGNATURE_HEADER), secret)) {
    return error(401, "invalid_signature", "Website lead signature is invalid or expired.");
  }

  let body: WebsiteLeadPayload;
  try {
    body = JSON.parse(rawBody) as WebsiteLeadPayload;
  } catch {
    return error(400, "invalid_json", "Request body must be valid JSON.");
  }

  const submissionId = body.submission_id?.trim();
  const name = body.name?.trim();

  if (!submissionId || submissionId.length > 191) {
    return error(400, "invalid_submission_id", "submission_id is required and must be at most 191 characters.");
  }
  if (!name || name.length > 160) {
    return error(400, "invalid_name", "Lead name is required and must be at most 160 characters.");
  }

  const existing = await findExistingLead(submissionId);
  if (existing) {
    return NextResponse.json({ ok: true, lead_id: existing.lead_id, duplicate: true });
  }

  const pipelineStatus = await prisma.pipelineStatus.findUnique({
    where: { status_code: "NEW_LEAD" },
    select: { pipeline_status_id: true },
  });
  if (!pipelineStatus) {
    return error(500, "missing_pipeline_status", "NEW_LEAD pipeline status is not configured.");
  }

  const attribution = toAttributionInput(body.attribution);

  try {
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          name,
          phone: body.phone?.trim() || null,
          email: body.email?.trim().toLowerCase() || null,
          source: "website",
          external_source: EXTERNAL_SOURCE,
          external_submission_id: submissionId,
          notes: body.notes?.trim() || null,
          pipeline_status_id: pipelineStatus.pipeline_status_id,
        },
        select: { lead_id: true },
      });

      await persistLeadAttribution(tx, created.lead_id, attribution);
      return created;
    });

    return NextResponse.json({ ok: true, lead_id: lead.lead_id, duplicate: false });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const duplicate = await findExistingLead(submissionId);
      if (duplicate) {
        return NextResponse.json({ ok: true, lead_id: duplicate.lead_id, duplicate: true });
      }
    }

    console.error("website_lead_ingest_failed", cause);
    return error(500, "lead_ingest_failed", "Lead could not be accepted by CRM.");
  }
}
