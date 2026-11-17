import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);

  if (!auth.ok) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  const sinceRevision = Number(request.query.get("since"));

  if (isNaN(sinceRevision)) {
    return apiError(400, "invalid_revision", "A valid revision number is required.");
  }

  const changes = await prisma.legacyWorkspaceChanges.findMany({
    where: {
      revision: {
        gt: sinceRevision,
      },
      // Apply role-based filtering here
    },
    orderBy: {
      revision: "asc",
    },
  });

  if (changes.length === 0) {
    return apiError(204, "no_changes", "No changes since the given revision.");
  }

  return apiSuccess({ changes });
}

