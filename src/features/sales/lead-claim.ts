/** Statuses in which a lead is still in the «Новые лиды» inbox. */
export const OPEN_LEAD_STATUS_CODES = ["NEW_LEAD", "LEAD", "CONTACTING", "CONTACTED", "QUALIFIED", "CONSULTATION_SCHEDULED"];

/** A claim older than this is treated as abandoned (e.g. a closed tab). */
export const LEAD_CLAIM_TTL_MS = 10 * 60 * 1000;

/** New reservations exclude fresh claims even from another tab of the same user. */
export function claimAvailableAt(now: Date) {
  return {
    OR: [
      { claimed_at: null },
      { claimed_at: { lt: new Date(now.getTime() - LEAD_CLAIM_TTL_MS) } },
    ],
  };
}

/** Manual stage edits may also use the current user's reservation. */
export function claimableBy(userId: string, now: Date) {
  return { OR: [...claimAvailableAt(now).OR, { claimed_by_user_id: userId }] };
}
