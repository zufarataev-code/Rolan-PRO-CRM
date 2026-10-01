/** Statuses in which a lead is still in the «Новые лиды» inbox. */
export const OPEN_LEAD_STATUS_CODES = ["NEW_LEAD", "LEAD", "CONSULTATION_SCHEDULED"];

/** A claim older than this is treated as abandoned (e.g. a closed tab). */
export const LEAD_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Claim condition: free, abandoned, or already held by this user. */
export function claimableBy(userId: string, now: Date) {
  return {
    OR: [
      { claimed_at: null },
      { claimed_at: { lt: new Date(now.getTime() - LEAD_CLAIM_TTL_MS) } },
      { claimed_by_user_id: userId },
    ],
  };
}
