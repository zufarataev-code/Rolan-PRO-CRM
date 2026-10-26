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
import { enforceProjectArchive } from "@/features/legacy-crm/project-archive";
import { applyEmployeeDirectory, loadDirectoryMembers } from "@/features/team/directory";
import {
  createFieldWorkspace,
  hasFieldWorkspaceRole,
  isPrivilegedLegacyWorkspaceRole,
  mergeFieldWorkspace,
} from "@/features/legacy-crm/field-workspace";
import {
  findIntroducedClientIdentityDuplicate,
} from "@/features/sales/client-identity";

import { prepareServiceSolutions, serviceSolutionsForViewer } from "@/features/legacy-crm/service-solutions";
import { validateProjectDirectExpenses } from "@/features/legacy-crm/project-direct-expenses";
import { prepareProductionStages, settleProductionProject } from "@/features/legacy-crm/production-stages";
import { prepareServiceScopeApprovals } from "@/features/legacy-crm/service-scope-approvals";

const WORKSPACE_ID = "primary";

function workspaceClients(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const clients = (payload as Record<string, unknown>).clients;
  if (!Array.isArray(clients)) return [];
  return clients.filter(
    (client): client is { id?: string; phone?: string | null; email?: string | null } =>
      Boolean(client && typeof client === "object" && !Array.isArray(client)),
  );
}

function duplicateClientError(duplicate: {
  existingClientId: string;
  duplicateClientId: string;
  matchedBy: "email" | "phone";
}) {
  return apiError(409, "duplicate_client", "Клиент с таким телефоном или email уже существует.", {
    existing_client_id: duplicate.existingClientId,
    duplicate_client_id: duplicate.duplicateClientId,
    matched_by: duplicate.matchedBy,
  });
}

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

  // Employee cards always come from PostgreSQL (one employee directory).
  // During "view as employee" this read must not write anything.
  const members = await loadDirectoryMembers((workspace.payload as { users?: unknown }).users ?? [], {
    persist: !auth.session.preview,
  });
  // A manager may also have a field role but normally has one manager card.
  // In a role preview, derive this employee's cards from the isolated session
  // roles, in memory only; the directory and production assignments stay intact.
  const viewerMembers = auth.session.preview ? members.map(member => member.userId === auth.session.user.user_id
    ? { ...member, roles: auth.session.roles } : member) : members;
  const payload = applyEmployeeDirectory(workspace.payload as Record<string, unknown>, viewerMembers);
  const legacyUserIds =
    members.find((member) => member.userId === auth.session.user.user_id)?.legacyUserIds ??
    auth.session.user.legacy_user_ids;
  const responsePayload = isPrivilegedLegacyWorkspaceRole(auth.session.roles)
    ? payload
    : createFieldWorkspace(payload, auth.session.roles, legacyUserIds);

  return apiSuccess({
    payload: serviceSolutionsForViewer(responsePayload, auth.session.roles.includes(ROLE_CODES.OWNER),
      auth.session.roles.includes(ROLE_CODES.INSTALLER) ? legacyUserIds : []),
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

    // The first snapshot is the baseline: historical duplicates it contains
    // are preserved (restore/migration must not require merging customers).
    // Only duplicates introduced by later saves are rejected.

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

  const mergedPayload = isPrivileged
    ? enforceProjectArchive(
        currentWorkspace.payload as Record<string, unknown>,
        payload as Record<string, unknown>,
        auth.session.roles.includes(ROLE_CODES.OWNER),
      ) as Prisma.InputJsonValue
    : sanitizeLegacyPayload(
        mergeFieldWorkspace(
          currentWorkspace.payload as Record<string, unknown>,
          body.payload,
          auth.session.roles,
          auth.session.user.legacy_user_ids,
        ),
      );
  // A browser can edit legacy-only profile fields such as phone or photo, but
  // never identity, access or compensation. Those are re-applied from PostgreSQL.
  const nextPayload = applyEmployeeDirectory(
    mergedPayload as Record<string, unknown>,
    await loadDirectoryMembers((mergedPayload as { users?: unknown }).users ?? []),
  ) as typeof mergedPayload;

  const scopeError = prepareServiceScopeApprovals(currentWorkspace.payload as Record<string, unknown>,nextPayload as Record<string, unknown>,
    auth.session.roles.includes(ROLE_CODES.OWNER),auth.session.roles.includes(ROLE_CODES.MANAGER) ? auth.session.user.legacy_user_ids : [],auth.session.user.user_id);
  if(scopeError) return apiError(400,"invalid_service_approval",scopeError);
  const stageError = prepareProductionStages(currentWorkspace.payload as Record<string, unknown>,
    nextPayload as Record<string, unknown>, auth.session.roles.includes(ROLE_CODES.OWNER),
    auth.session.roles.includes(ROLE_CODES.MANAGER) ? auth.session.user.legacy_user_ids : [], !isPrivileged, auth.session.user.user_id);
  if (stageError) return apiError(400, "invalid_production_stage", stageError);

  const solutionError = prepareServiceSolutions(
    currentWorkspace.payload as Record<string, unknown>,
    nextPayload as Record<string, unknown>,
    auth.session.roles.includes(ROLE_CODES.OWNER),
  );
  if (solutionError) return apiError(400, "invalid_service_solution", solutionError);
  for (const order of (nextPayload as Record<string, any>).orders || []) {
    const previous = ((currentWorkspace.payload as Record<string, any>).orders || []).find((item: Record<string, any>) => item.id === order.id) || {};
    settleProductionProject(previous, order, nextPayload as Record<string, any>, auth.session.user.user_id);
  }

  const expenseError = validateProjectDirectExpenses(
    currentWorkspace.payload as Record<string, unknown>, nextPayload as Record<string, unknown>,
    auth.session.roles.includes(ROLE_CODES.OWNER),
    auth.session.roles.includes(ROLE_CODES.MANAGER) ? auth.session.user.legacy_user_ids : [],
  );
  if (expenseError) return apiError(400, "invalid_project_expense", expenseError);

  const introducedDuplicate = findIntroducedClientIdentityDuplicate(
    workspaceClients(currentWorkspace.payload),
    workspaceClients(nextPayload),
  );
  if (introducedDuplicate) return duplicateClientError(introducedDuplicate);

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

  const stagePayload = serviceSolutionsForViewer(isPrivileged ? nextPayload as Record<string, any>
    : createFieldWorkspace(nextPayload as Record<string, unknown>, auth.session.roles, auth.session.user.legacy_user_ids) as Record<string, any>,
    auth.session.roles.includes(ROLE_CODES.OWNER)) as Record<string, any>;
  return apiSuccess({ ...workspace, production_stage_updates: (stagePayload.orders || [])
    .filter((order: Record<string, any>) => Array.isArray(order.serviceScopeApprovals) || Array.isArray(order.productionStages))
    .map((order: Record<string, any>) => ({ id: order.id, productionStages: order.productionStages || [], serviceScopeApprovals: order.serviceScopeApprovals, status: order.status, installationDoneAt: order.installationDoneAt, serviceProgress: order.serviceProgress, serviceSchedules: order.serviceSchedules, installerIds: order.installerIds, installationAt: order.installationAt, servicesClosedNotice: order.servicesClosedNotice, timeline: order.timeline,
      stageExpenses: (order.extraExpenses || []).filter((expense: Record<string, any>) => expense.stageDerived === true) })) });
}
