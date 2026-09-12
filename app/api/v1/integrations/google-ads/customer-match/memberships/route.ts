import { NextRequest } from "next/server";

import {
  CustomerMatchValidationError,
  setCustomerMatchMembershipDesiredState,
} from "@/features/google-ads/customer-match";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type MembershipRequestBody = {
  subject_type?: unknown;
  subject_id?: unknown;
  desired_state?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads Customer Match membership changes are owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as MembershipRequestBody | null;
  if (!body || typeof body !== "object") {
    return apiError(400, "invalid_body", "A JSON request body is required.");
  }
  if (typeof body.subject_type !== "string") {
    return apiError(400, "subject_type_required", "subject_type is required.");
  }
  if (typeof body.subject_id !== "string") {
    return apiError(400, "subject_id_required", "subject_id is required.");
  }
  if (typeof body.desired_state !== "string") {
    return apiError(400, "desired_state_required", "desired_state is required.");
  }

  try {
    const result = await prisma.$transaction((tx) =>
      setCustomerMatchMembershipDesiredState(tx, {
        subjectType: body.subject_type as string,
        subjectId: body.subject_id as string,
        desiredState: body.desired_state as string,
      }),
    );

    return apiSuccess({
      customer_match_membership_id: result.membership.customer_match_membership_id,
      subject_type: result.membership.subject_type,
      subject_id: result.membership.subject_id,
      desired_state: result.membership.desired_state,
      applied_state: result.membership.applied_state,
      queued_outbox_ids: result.queuedOutboxIds,
    });
  } catch (cause) {
    if (cause instanceof CustomerMatchValidationError) {
      return apiError(400, cause.code, cause.message);
    }
    throw cause;
  }
}
