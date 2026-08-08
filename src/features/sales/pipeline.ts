export const PIPELINE_STAGE_CODES = [
  "NEW_LEAD",
  "CONTACTED",
  "CONSULTATION_SCHEDULED",
  "CONSULTATION_COMPLETED",
  "SURVEY_COMPLETED",
  "PROPOSAL_DRAFT",
  "PROPOSAL_SENT",
  "APPROVED",
  "PROPOSAL_UPDATED_BY_CLIENT",
  "AGREEMENT_SIGNED",
  "DEPOSIT_PENDING",
  "DEPOSIT_PAID",
  "PROJECT_CREATED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "FINAL_PAYMENT_PENDING",
  "PAID",
  "CLOSED_WON",
  "CLOSED_LOST",
  "WARRANTY_SERVICE",
] as const;

export type PipelineStageCode = (typeof PIPELINE_STAGE_CODES)[number];

export const FOLLOW_UP_TYPES = [
  "call",
  "email",
  "sms",
  "proposal_review_call",
  "deposit_reminder",
  "site_follow_up",
] as const;

export const TASK_STATUSES = ["open", "in_progress", "done", "canceled"] as const;

export const FOLLOW_UP_STATUSES = ["scheduled", "completed", "skipped", "canceled"] as const;

export const PIPELINE_STAGE_TRANSITIONS: Record<PipelineStageCode, PipelineStageCode[]> = {
  NEW_LEAD: ["CONTACTED", "CLOSED_LOST"],
  CONTACTED: ["CONSULTATION_SCHEDULED", "CLOSED_LOST"],
  CONSULTATION_SCHEDULED: ["CONSULTATION_COMPLETED", "CLOSED_LOST"],
  CONSULTATION_COMPLETED: ["SURVEY_COMPLETED", "CLOSED_LOST"],
  SURVEY_COMPLETED: ["PROPOSAL_DRAFT", "CLOSED_LOST"],
  PROPOSAL_DRAFT: ["PROPOSAL_SENT", "CLOSED_LOST"],
  PROPOSAL_SENT: ["APPROVED", "PROPOSAL_UPDATED_BY_CLIENT", "AGREEMENT_SIGNED", "CLOSED_LOST"],
  APPROVED: ["DEPOSIT_PAID", "CLOSED_LOST"],
  PROPOSAL_UPDATED_BY_CLIENT: ["PROPOSAL_DRAFT", "PROPOSAL_SENT", "APPROVED", "AGREEMENT_SIGNED", "CLOSED_LOST"],
  AGREEMENT_SIGNED: ["APPROVED", "DEPOSIT_PENDING", "CLOSED_LOST"],
  DEPOSIT_PENDING: ["DEPOSIT_PAID", "CLOSED_LOST"],
  DEPOSIT_PAID: ["PROJECT_CREATED"],
  PROJECT_CREATED: ["SCHEDULED"],
  SCHEDULED: ["IN_PROGRESS", "WARRANTY_SERVICE"],
  IN_PROGRESS: ["COMPLETED", "WARRANTY_SERVICE"],
  COMPLETED: ["FINAL_PAYMENT_PENDING", "WARRANTY_SERVICE"],
  FINAL_PAYMENT_PENDING: ["PAID", "WARRANTY_SERVICE"],
  PAID: ["CLOSED_WON", "WARRANTY_SERVICE"],
  CLOSED_WON: ["WARRANTY_SERVICE"],
  CLOSED_LOST: [],
  WARRANTY_SERVICE: [],
};

export function isValidStageTransition(
  from: string,
  to: string,
): boolean {
  const allowed = PIPELINE_STAGE_TRANSITIONS[from as PipelineStageCode];
  return Array.isArray(allowed) && allowed.includes(to as PipelineStageCode);
}

export function getAllowedStageTransitions(from: string) {
  return PIPELINE_STAGE_TRANSITIONS[from as PipelineStageCode] ?? [];
}
