import { NextRequest } from "next/server";

import { markInstallerPayrollPaid } from "@/features/installer-operations/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/**
 * The owner or a manager paid an employee for a period in the CRM (payroll screen).
 * Marks the matching PostgreSQL accruals paid: the employee's own installer
 * accruals and, for a team lead, their 10% group overrides.
 */
export async function POST(request: NextRequest) {
  // Same roles as the CRM payroll screen that records the payment.
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Payroll update denied.");

  const body = (await request.json().catch(() => null)) as
    | { legacyUserId?: string; periodStart?: string; periodEnd?: string }
    | null;
  const legacyUserId = String(body?.legacyUserId || "").trim();
  const start = new Date(String(body?.periodStart || ""));
  const end = new Date(String(body?.periodEnd || ""));
  if (!legacyUserId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return apiError(400, "invalid_payload", "legacyUserId, periodStart and periodEnd are required.");
  }

  const result = await markInstallerPayrollPaid({ legacyUserId, start, end });
  if (!result) return apiError(404, "not_found", "Employee was not found.");
  return apiSuccess(result);
}
