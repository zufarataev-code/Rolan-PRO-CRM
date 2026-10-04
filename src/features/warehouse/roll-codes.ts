import { prisma } from "@/lib/db";

/** «RP-2610-0007» for 2026-10 and number 7. */
export function formatRollCode(period: string, value: number) {
  return `RP-${period}-${String(value).padStart(4, "0")}`;
}

/** YYMM of a YYYY-MM-DD receipt date (today when invalid), as the CRM page counts it. */
export function rollCodePeriod(date: string | null | undefined, today = new Date()) {
  const day = /^\d{4}-\d{2}/.test(String(date || "")) ? String(date) : today.toISOString().slice(0, 10);
  return `${day.slice(2, 4)}${day.slice(5, 7)}`;
}

/**
 * Next roll code for the month, reserved atomically. `seenMax` is the highest
 * number already present in the CRM for that month, so codes issued before the
 * server counter existed are never repeated.
 */
export async function reserveRollCode(date: string | null | undefined, seenMax: number) {
  const period = rollCodePeriod(date);
  const floor = Number.isInteger(seenMax) && seenMax > 0 ? Math.min(seenMax, 999_999) : 0;
  const rows = await prisma.$queryRaw<Array<{ last_value: number }>>`
    INSERT INTO "roll_code_counters" ("period", "last_value") VALUES (${period}, ${floor + 1})
    ON CONFLICT ("period") DO UPDATE SET "last_value" = GREATEST("roll_code_counters"."last_value", ${floor}) + 1
    RETURNING "last_value"`;
  return formatRollCode(period, Number(rows[0].last_value));
}
