import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";

export const PROPOSAL_MANAGER_ROLES: readonly RoleCode[] = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER];

export const PROPOSAL_STATUSES = {
  DRAFT: "draft",
  SENT: "sent",
  CLIENT_UPDATED: "client_updated",
  AGREEMENT_SIGNED: "agreement_signed",
  APPROVED: "approved",
} as const;

export const AGREEMENT_STATUSES = {
  PENDING: "pending",
  SIGNED: "signed",
} as const;

export const DEPOSIT_STATUSES = {
  PENDING: "pending",
  PAID: "paid",
} as const;
