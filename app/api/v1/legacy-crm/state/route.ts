import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import {
  sanitizeLegacyPayload,
  validateLegacyPayload,
} from "@/features/legacy-crm/sanitize";
import { LEGACY_WORKSPACE_VIEW_ROLES } from "@/features/legacy-crm/api";
import {
  createFieldWorkspace,
  hasFieldWorkspaceRole,
  isPrivilegedLegacyWorkspaceRole,
  mergeFieldWorkspace,
} from "@/features/legacy-crm/field-workspace";

const WORKSPACE_ID = "primary";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);

  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Legacy CRM workspace access denied.",
    );
  }

  const workspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: WORKSPACE_ID },
  });

  if (!workspace) {
    return apiError(404, "workspace_not_initialized", "CRM workspace is not initialized.");
  }

  const payload = workspace.payload as Record<string, unknown>;
  const responsePayload = isPrivilegedLegacyWorkspaceRole(auth.session.roles)
    ? payload
    : createFieldWorkspace(
        payload,
        auth.session.roles,
        auth.session.user.legacy_user_ids,
      );

  return apiSuccess({
    payload: responsePayload,
    revision: workspace.revision,
    updated_at: workspace.updated_at,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);

  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Legacy CRM workspace update denied.",
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { payload?: unknown; revision?: number }
    | null;

  if (!body || !Number.isInteger(body.revision) || !validateLegacyPayload(body.payload)) {
    return apiError(400, "invalid_payload", "A valid CRM payload and revision are required.");
  }

  const isPrivileged = isPrivilegedLegacyWorkspaceRole(auth.session.roles);

  if (!isPrivileged && !hasFieldWorkspaceRole(auth.session.roles)) {
    return apiError(403, "forbidden", "Legacy CRM workspace update denied.");
  }

  const payload = sanitizeLegacyPayload(body.payload);

  if (body.revision === 0) {
    if (!auth.session.roles.includes(ROLE_CODES.OWNER)) {
      return apiError(403, "forbidden", "Only the owner can initialize CRM data.");
    }

    try {
      const workspace = await prisma.legacyWorkspace.create({
        data: {
          workspace_id: WORKSPACE_ID,
          payload,
          revision: 1,
          updated_by: auth.session.user.user_id,
        },
      });

      return apiSuccess({ revision: workspace.revision, updated_at: workspace.updated_at });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return apiError(409, "workspace_exists", "CRM workspace is already initialized.");
      }
      throw error;
    }
  }

  const currentWorkspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: WORKSPACE_ID },
  });

  if (!currentWorkspace || currentWorkspace.revision !== body.revision) {
    return apiError(409, "revision_conflict", "CRM data changed in another browser.", {
      current_revision: currentWorkspace?.revision ?? null,
      updated_at: currentWorkspace?.updated_at ?? null,
    });
  }

  const nextPayload = isPrivileged
    ? payload
    : sanitizeLegacyPayload(
        mergeFieldWorkspace(
          currentWorkspace.payload as Record<string, unknown>,
          body.payload,
          auth.session.roles,
          auth.session.user.legacy_user_ids,
        ),
      );

  const updated = await prisma.legacyWorkspace.updateMany({
    where: {
      workspace_id: WORKSPACE_ID,
      revision: body.revision,
    },
    data: {
      payload: nextPayload,
      revision: { increment: 1 },
      updated_by: auth.session.user.user_id,
    },
  });

  if (updated.count !== 1) {
    const current = await prisma.legacyWorkspace.findUnique({
      where: { workspace_id: WORKSPACE_ID },
      select: { revision: true, updated_at: true },
    });

    return apiError(409, "revision_conflict", "CRM data changed in another browser.", {
      current_revision: current?.revision ?? null,
      updated_at: current?.updated_at ?? null,
    });
  }

  const workspace = await prisma.legacyWorkspace.findUniqueOrThrow({
    where: { workspace_id: WORKSPACE_ID },
    select: { revision: true, updated_at: true },
  });

  return apiSuccess(workspace);
}
