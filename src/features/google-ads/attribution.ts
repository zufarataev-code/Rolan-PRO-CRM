import type { Prisma } from "@prisma/client";

import type { AttributionCaptureInput, ConsentState } from "./types";

const CLICK_ID_MAX_LENGTH = 2048;
const UTM_MAX_LENGTH = 255;
const META_MAX_LENGTH = 100;

function cleanText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function cleanJsonObject(value: Record<string, unknown> | null | undefined) {
  if (!value || Array.isArray(value)) return null;
  return value;
}

function normalizeDate(value: Date | null | undefined, fallback: Date) {
  if (!value || Number.isNaN(value.getTime())) return fallback;
  return value;
}

export function normalizeConsentState(value: ConsentState | string | null | undefined): ConsentState {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "GRANTED" || normalized === "DENIED") return normalized;
  return "UNKNOWN";
}

export function normalizeAttributionCapture(
  input: AttributionCaptureInput | null | undefined,
  now = new Date(),
) {
  if (!input) return null;

  const adUserData = normalizeConsentState(input.consent?.adUserData);
  const adPersonalization = normalizeConsentState(input.consent?.adPersonalization);
  const requestedAudienceEligibility = input.consent?.audienceMarketingEligible === true;

  // Audience eligibility remains a separate CRM decision, but it can never override
  // a denied or unknown consent state.
  const audienceMarketingEligible =
    requestedAudienceEligibility && adUserData === "GRANTED" && adPersonalization === "GRANTED";

  return {
    leadId: cleanText(input.leadId, META_MAX_LENGTH),
    dealId: cleanText(input.dealId, META_MAX_LENGTH),
    clientId: cleanText(input.clientId, META_MAX_LENGTH),
    gclid: cleanText(input.gclid, CLICK_ID_MAX_LENGTH),
    gbraid: cleanText(input.gbraid, CLICK_ID_MAX_LENGTH),
    wbraid: cleanText(input.wbraid, CLICK_ID_MAX_LENGTH),
    landingPage: cleanText(input.landingPage, 4096),
    utmSource: cleanText(input.utmSource, UTM_MAX_LENGTH),
    utmMedium: cleanText(input.utmMedium, UTM_MAX_LENGTH),
    utmCampaign: cleanText(input.utmCampaign, UTM_MAX_LENGTH),
    utmTerm: cleanText(input.utmTerm, UTM_MAX_LENGTH),
    utmContent: cleanText(input.utmContent, UTM_MAX_LENGTH),
    sessionAttributes: cleanJsonObject(input.sessionAttributes),
    capturedAt: normalizeDate(input.capturedAt, now),
    consent: input.consent
      ? {
          adUserData,
          adPersonalization,
          audienceMarketingEligible,
          source: cleanText(input.consent.source, META_MAX_LENGTH) ?? "unspecified",
          policyVersion: cleanText(input.consent.policyVersion, META_MAX_LENGTH),
          effectiveAt: normalizeDate(input.consent.effectiveAt, now),
        }
      : null,
  };
}

export function hasAttributionData(
  capture: NonNullable<ReturnType<typeof normalizeAttributionCapture>>,
) {
  return Boolean(
    capture.gclid ||
      capture.gbraid ||
      capture.wbraid ||
      capture.landingPage ||
      capture.utmSource ||
      capture.utmMedium ||
      capture.utmCampaign ||
      capture.utmTerm ||
      capture.utmContent ||
      capture.sessionAttributes,
  );
}

export async function persistLeadAttribution(
  tx: Prisma.TransactionClient,
  leadId: string,
  input: AttributionCaptureInput | null | undefined,
) {
  const capture = normalizeAttributionCapture(input);
  if (!capture) {
    return { acquisitionTouchpointId: null, consentSnapshotId: null };
  }

  let acquisitionTouchpointId: string | null = null;
  let consentSnapshotId: string | null = null;

  // Touchpoints are append-only. A later direct/empty visit creates no replacement
  // row, so a previously captured Google identifier is never erased by this path.
  if (hasAttributionData(capture)) {
    const touchpoint = await tx.acquisitionTouchpoint.create({
      data: {
        lead_id: leadId,
        gclid: capture.gclid,
        gbraid: capture.gbraid,
        wbraid: capture.wbraid,
        landing_page: capture.landingPage,
        utm_source: capture.utmSource,
        utm_medium: capture.utmMedium,
        utm_campaign: capture.utmCampaign,
        utm_term: capture.utmTerm,
        utm_content: capture.utmContent,
        session_attributes: capture.sessionAttributes as Prisma.InputJsonValue | undefined,
        captured_at: capture.capturedAt,
      },
      select: { acquisition_touchpoint_id: true },
    });
    acquisitionTouchpointId = touchpoint.acquisition_touchpoint_id;
  }

  if (capture.consent) {
    const consent = await tx.consentSnapshot.create({
      data: {
        lead_id: leadId,
        ad_user_data: capture.consent.adUserData,
        ad_personalization: capture.consent.adPersonalization,
        audience_marketing_eligible: capture.consent.audienceMarketingEligible,
        source: capture.consent.source,
        policy_version: capture.consent.policyVersion,
        effective_at: capture.consent.effectiveAt,
      },
      select: { consent_snapshot_id: true },
    });
    consentSnapshotId = consent.consent_snapshot_id;
  }

  return { acquisitionTouchpointId, consentSnapshotId };
}
