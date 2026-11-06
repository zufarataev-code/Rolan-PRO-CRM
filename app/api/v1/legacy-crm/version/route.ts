import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { LEGACY_WORKSPACE_VIEW_ROLES } from "@/features/legacy-crm/api";
import { currentReleaseId } from "@/features/legacy-crm/release";

export const dynamic = "force-dynamic";

/**
 * One light request for an open CRM tab (Owner, 2026-11-05: «когда мы вносим
 * изменения, у сотрудников всё обновляется автоматически»): which code release
 * the server runs and which revision the shared workspace is at. The page
 * compares both with what it holds — a newer revision is merged in without a
 * reload, a newer release reloads the page at a quiet moment.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Legacy CRM workspace access denied.");
  }
  const workspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: "primary" },
    select: { revision: true, updated_at: true },
  });
  return apiSuccess({
    release: currentReleaseId(),
    revision: workspace?.revision ?? 0,
    updated_at: workspace?.updated_at ?? null,
  });
}
