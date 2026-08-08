import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type SiteLeadPayload = {
  name?: string;
  phone?: string;
  email?: string;
  propertyType?: string;
  serviceType?: string;
  city?: string;
  message?: string;
  smsConsent?: boolean;
};

const smsConsentDisclosure =
  "I agree to receive SMS messages from RolanPRO about my quote, appointment, project updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";

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

  if (!name) {
    return apiError(400, "invalid_payload", "Please enter your name.");
  }

  if (!phone) {
    return apiError(400, "invalid_payload", "Please enter your phone number.");
  }

  if (!smsConsent) {
    return apiError(400, "sms_consent_required", "Please confirm SMS consent so we can text you about this request.");
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

  const notes = [
    "Website landing inquiry",
    serviceType ? `Service: ${serviceType}` : null,
    propertyType ? `Property: ${propertyType}` : null,
    city ? `City / Area: ${city}` : null,
    message ? `Message: ${message}` : null,
    "SMS consent: yes",
    `SMS consent captured at: ${new Date().toISOString()}`,
    `SMS disclosure shown: ${smsConsentDisclosure}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lead = await prisma.lead.create({
    data: {
      name,
      phone,
      email: email || null,
      source: "website_landing",
      notes: notes || null,
      pipeline_status_id: newLeadStatus.pipeline_status_id,
    },
    select: {
      lead_id: true,
    },
  });

  return apiSuccess({
    lead_id: lead.lead_id,
  });
}
