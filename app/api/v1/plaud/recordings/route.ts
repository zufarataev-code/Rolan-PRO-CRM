import { NextRequest } from "next/server";

import { LEGACY_WORKSPACE_VIEW_ROLES } from "@/features/legacy-crm/api";
import { PlaudError } from "@/features/integrations/plaud-core";
import { listPlaudRecordings, plaudRecordingOrderId, plaudViewerOrderIds, updatePlaudRecording } from "@/features/integrations/plaud";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export const runtime = "nodejs";

/** `?orderId=<id>` — recordings of a project; `?unassigned=1` — not yet linked. */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "CRM access is required.");
  const orderId = request.nextUrl.searchParams.get("orderId");
  const unassigned = request.nextUrl.searchParams.get("unassigned") === "1";
  if (!unassigned && !orderId) return apiError(400, "order_required", "orderId or unassigned=1 is required.");
  const scope = await plaudViewerOrderIds(auth.session.roles, auth.session.user.legacy_user_ids);
  // The unmatched inbox can hold any client's conversation — owner/manager only.
  if (scope && (unassigned || !scope.has(orderId!))) return apiError(403, "forbidden", "Not your project.");
  return apiSuccess({ recordings: await listPlaudRecordings(unassigned ? null : orderId!.slice(0, 100)) });
}

/** `{ id, orderId }` links a recording to a project; `{ id, applied: true }` marks it used. */
export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "CRM access is required.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return apiError(400, "invalid_json", "Body must be JSON."); }
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : "";
  if (!id) return apiError(400, "invalid_id", "Recording id is required.");
  const change: { orderId?: string | null; applied?: boolean } = {};
  if ("orderId" in body) change.orderId = typeof body.orderId === "string" && body.orderId ? body.orderId.slice(0, 100) : null;
  if (body.applied === true) change.applied = true;
  const scope = await plaudViewerOrderIds(auth.session.roles, auth.session.user.legacy_user_ids);
  if (scope) {
    // Field employees may only mark their own project's recording as used.
    const current = await plaudRecordingOrderId(id);
    if (change.orderId !== undefined || !current || !scope.has(current)) return apiError(403, "forbidden", "Not your project.");
  }
  try {
    return apiSuccess({ recording: await updatePlaudRecording(id, change, auth.session.user?.user_id ?? null) });
  } catch (cause) {
    if (cause instanceof PlaudError) return apiError(cause.status, cause.code, cause.message);
    throw cause;
  }
}
