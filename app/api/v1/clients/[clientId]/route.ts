import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";
import { buildClientAccessWhere, getRecordManagerScope } from "@/features/sales/access";
import {
  findExistingClientByIdentity,
  lockClientIdentityUpdate,
  normalizeClientEmail,
} from "@/features/sales/client-identity";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Client update denied.");
  }

  const { clientId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, string | null> | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const managerId = getRecordManagerScope(auth.session);
  const contact = {
    phone: body.phone?.trim() || null,
    email: normalizeClientEmail(body.email) || null,
  };
  const result = await prisma.$transaction(async (tx) => {
    // Authorize the target first: the duplicate answer names another client and
    // must never be reachable for a card the caller cannot edit.
    const target = await tx.client.findFirst({
      where: buildClientAccessWhere(clientId, managerId),
      select: { client_id: true },
    });
    if (!target) return { client: null, duplicate: null, visible: false } as const;

    const changed = await lockClientIdentityUpdate(tx, clientId, contact);
    const duplicate = await findExistingClientByIdentity(tx, changed, clientId);
    if (duplicate) {
      // Name the other card only if this manager may see it.
      const visible = await tx.client.count({ where: buildClientAccessWhere(duplicate.client.client_id, managerId) });
      return { client: null, duplicate, visible: visible > 0 } as const;
    }

    const result = await tx.client.updateMany({
      where: buildClientAccessWhere(clientId, managerId),
      data: {
        name: body.name?.trim() || undefined,
        phone: contact.phone,
        email: contact.email,
        billing_address: body.billing_address?.trim() || null,
        service_address: body.service_address?.trim() || null,
        city_id: body.city_id || null,
        zip_code: body.zip_code?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });

    const client = result.count === 1
      ? await tx.client.findUnique({ where: { client_id: clientId } })
      : null;
    return { client, duplicate: null, visible: false } as const;
  });

  if (result.duplicate) {
    return apiError(
      409,
      "duplicate_client",
      "Клиент с таким телефоном или email уже существует.",
      result.visible
        ? {
            existing_client_id: result.duplicate.client.client_id,
            existing_client_name: result.duplicate.client.name,
            matched_by: result.duplicate.matchedBy,
          }
        : undefined,
    );
  }

  const client = result.client;
  if (!client) {
    return apiError(404, "not_found", "Client was not found.");
  }

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "client",
    entityId: client.client_id,
    actionKey: "client.updated",
    message: `Карточка клиента ${client.name} обновлена.`,
  });

  return apiSuccess({
    client_id: client.client_id,
  });
}
