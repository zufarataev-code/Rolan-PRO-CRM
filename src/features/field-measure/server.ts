import type { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";
import { isPrivilegedLegacyWorkspaceRole } from "@/features/legacy-crm/field-workspace";
import type { FieldMeasureViewer } from "@/features/field-measure/view";
// The workspace this employee is allowed to see is decided in one place — the
// legacy state endpoint (roles, assignments, money redaction). The field screen
// reads through it instead of repeating those rules.
import { GET as readLegacyState } from "../../../app/api/v1/legacy-crm/state/route";

export const FIELD_MEASURE_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT] as const;

type Loaded =
  | { ok: true; payload: Record<string, unknown>; viewer: FieldMeasureViewer }
  | { ok: false; response: Response };

export async function loadFieldMeasureWorkspace(request: NextRequest): Promise<Loaded> {
  const auth = await requireRequestSession(request, FIELD_MEASURE_ROLES);
  if (!auth.ok) {
    return { ok: false, response: apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Field measurement access denied.") };
  }
  const state = await readLegacyState(request);
  if (!state.ok) return { ok: false, response: state };
  const body = (await state.json()) as { data?: { payload?: Record<string, unknown> } };
  const payload = body.data?.payload;
  if (!payload) return { ok: false, response: apiError(404, "workspace_not_initialized", "CRM workspace is not initialized.") };
  return {
    ok: true,
    payload,
    viewer: {
      legacyUserIds: auth.session.user.legacy_user_ids ?? [],
      // A field employee only ever receives the Projects assigned to them.
      everyOrderIsMine: !isPrivilegedLegacyWorkspaceRole(auth.session.roles),
    },
  };
}
