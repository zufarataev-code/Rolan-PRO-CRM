import { NextRequest } from "next/server";

import { createAppointmentLinkForOrder } from "@/features/legacy-crm/public-appointments";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Appointment link access denied.");
  }
  if (auth.session.preview) {
    return apiError(403, "preview_forbidden", "Role preview cannot create client links.");
  }

  const body = await request.json().catch(() => null) as { orderId?: string } | null;
  const orderId = body?.orderId?.trim();
  if (!orderId) return apiError(400, "invalid_payload", "Order id is required.");

  const allowedManagerIds = auth.session.roles.includes(ROLE_CODES.OWNER)
    ? null
    : auth.session.user.legacy_user_ids;
  const link = await createAppointmentLinkForOrder(orderId, allowedManagerIds);
  if (!link) return apiError(404, "appointment_not_found", "An active appointment was not found.");
  return apiSuccess({
    ...link,
    url: `${request.nextUrl.origin}/appointment/${encodeURIComponent(link.token)}`,
  });
}
