import { persistLeadAttribution } from "@/features/google-ads/attribution";
import { prisma } from "@/lib/db";
import { buildSiteLeadNotes } from "@/features/leads/site-lead-notes";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type SiteLeadPayload = {
  attribution?: Record<string, any> | null;
  name?: string;
  phone?: string;
  email?: string;
  propertyType?: string;
  serviceType?: string;
  city?: string;
  message?: string;
  smsConsent?: boolean;
  consentSource?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SiteLeadPayload | null;

  const name = body?.name?.trim();
  const phone = body?.phone?.trim();
  const email = body?.email ? body.email.trim().toLowerCase() : undefined;
  const propertyType = body?.propertyType?.trim();
  const serviceType = body?.serviceType?.trim();
  const city = body?.city?.trim();
  const message = body?.message?.trim();
  const smsConsent = body?.smsConsent === true;
  const consentSource = body?.consentSource === "sms_consent_page" ? "sms_consent_page" : "website_landing";

  if (!name) {
    return apiError(400, "invalid_payload", "Please enter your name.");
  }

  if (!phone) {
    return apiError(400, "invalid_payload", "Please enter your phone number.");
  }

  if (name.length > 160 || phone.length > 40 || (email && email.length > 191)) {
    return apiError(400, "invalid_payload", "One of the fields is too long.");
  }

  const newLeadStatus =
    (await prisma.pipelineStatus.findUnique({
      where: {
        status_code: "NEW_LEAD",
      },
      select: {
        pipeline_status_id: true,
      },
    })) ??
    (await prisma.pipelineStatus.findUnique({
      where: {
        status_code: "LEAD",
      },
      select: {
        pipeline_status_id: true,
      },
    }));

  if (!newLeadStatus) {
    return apiError(500, "missing_pipeline_status", "Pipeline status for new leads is not configured.");
  }

  const notes = buildSiteLeadNotes({
    consentSource,
    smsConsent,
    serviceType,
    propertyType,
    city,
    message,
  });

  const lead = await prisma.$transaction(async tx => {
    const created = await tx.lead.create({
    data: {
      name,
      phone,
      email: email || null,
      source: consentSource,
      notes: notes || null,
      pipeline_status_id: newLeadStatus.pipeline_status_id,
    },
    select: {
      lead_id: true,
    },
  });
    const attribution = body?.attribution;
    if (attribution && typeof attribution === "object" && !Array.isArray(attribution)) {
      await persistLeadAttribution(tx, created.lead_id, {
        googleAdsCustomerId: attribution.google_ads_customer_id, googleAdsCampaignId: attribution.google_ads_campaign_id,
        gclid: attribution.gclid, gbraid: attribution.gbraid, wbraid: attribution.wbraid,
        landingPage: attribution.landing_page, utmSource: attribution.utm_source, utmMedium: attribution.utm_medium,
        utmCampaign: attribution.utm_campaign, utmTerm: attribution.utm_term, utmContent: attribution.utm_content,
        consent: { adUserData: attribution.consent?.ad_user_data === "GRANTED" ? "GRANTED" : "UNKNOWN", adPersonalization: "UNKNOWN", audienceMarketingEligible: false, source: "website_landing", policyVersion: "ads-measurement-v1" },
      });
    }
    return created;
  });

  return apiSuccess({
    lead_id: lead.lead_id,
    sms_consent: smsConsent,
  });
}
