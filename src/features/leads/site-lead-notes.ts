export const smsConsentDisclosure =
  "Optional SMS updates: I agree to receive customer-care and transactional SMS messages from RolanPRO about my quote, consultation, measurement appointment, installation schedule, project updates, payment balance, and support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. I can submit this service request without checking this box.";

type SiteLeadNotesInput = {
  consentSource: "sms_consent_page" | "website_landing";
  smsConsent: boolean;
  serviceType?: string;
  propertyType?: string;
  city?: string;
  message?: string;
};

export function buildSiteLeadNotes(input: SiteLeadNotesInput, capturedAt = new Date()) {
  const sourceLabel =
    input.consentSource === "sms_consent_page"
      ? input.smsConsent
        ? "Website service request with SMS opt-in"
        : "Website service request without SMS opt-in"
      : "Website landing inquiry";

  return [
    sourceLabel,
    input.serviceType ? `Service: ${input.serviceType}` : null,
    input.propertyType ? `Property: ${input.propertyType}` : null,
    input.city ? `City / Area: ${input.city}` : null,
    input.message ? `Message: ${input.message}` : null,
    `SMS consent: ${input.smsConsent ? "yes" : "no"}`,
    input.smsConsent ? `SMS consent captured at: ${capturedAt.toISOString()}` : null,
    input.smsConsent ? `SMS disclosure shown: ${smsConsentDisclosure}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
