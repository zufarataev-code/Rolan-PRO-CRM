export type ConsentState = "GRANTED" | "DENIED" | "UNKNOWN";
export type ConversionEventType = "qualified_lead" | "converted_lead";
export type AudienceOperation = "ADD" | "REMOVE";

export interface GoogleAdsSettings {
  settings_key: string;
  google_cloud_project_id: string | null;
  conversion_owner_customer_id: string | null;
  login_customer_id: string | null;
  qualified_lead_action_id: string | null;
  converted_lead_action_id: string | null;
  audience_owner_account_id: string | null;
  upload_enabled: boolean;
  validate_only: boolean;
  customer_match_terms_accepted: boolean;
  business_rules: Record<string, unknown>;
  audience_rules: Record<string, unknown>;
}

export interface AttributionCaptureInput {
  leadId?: string | null;
  dealId?: string | null;
  clientId?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  landingPage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  sessionAttributes?: Record<string, unknown> | null;
  capturedAt?: Date | null;
  source?: string | null;
  consent?: {
    adUserData: ConsentState;
    adPersonalization: ConsentState;
    audienceMarketingEligible: boolean;
    source: string;
    policyVersion?: string | null;
    effectiveAt?: Date | null;
  } | null;
}

export interface ConversionJob {
  outbox_id: string;
  event_id: string;
  destination_account_id: string | null;
  login_customer_id: string | null;
  action_id: string | null;
  transaction_id: string;
  attempts: number;
  payload_snapshot: unknown;
  event_type: ConversionEventType;
  occurred_at: Date;
  event_source: string;
  conversion_value: unknown;
  currency: string | null;
  event_snapshot: Record<string, unknown>;
}

export interface AudienceJob {
  audience_outbox_id: string;
  membership_id: string;
  segment_key: string;
  operation: AudienceOperation;
  revision: number;
  attempts: number;
  owner_account_id: string | null;
  user_list_id: string | null;
  identifiers_snapshot: Record<string, unknown> | null;
  ad_user_data: ConsentState | null;
  ad_personalization: ConsentState | null;
}

export interface AdjustmentJob {
  adjustment_id: string;
  original_event_id: string;
  original_action_id: string;
  original_transaction_id: string;
  adjustment_type: "RESTATEMENT" | "RETRACTION";
  revised_total: unknown;
  currency: string | null;
  adjustment_time: Date;
  revision: number;
  attempts: number;
}

export interface WorkerResult {
  leased: number;
  processed: number;
  submitted: number;
  validated: number;
  suppressed: number;
  retried: number;
  failed: number;
  details?: Record<string, unknown>;
}
