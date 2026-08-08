import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";

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

  const client = await prisma.client.update({
    where: {
      client_id: clientId,
    },
    data: {
      name: body.name?.trim() || undefined,
      phone: body.phone?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      billing_address: body.billing_address?.trim() || null,
      service_address: body.service_address?.trim() || null,
      city_id: body.city_id || null,
      zip_code: body.zip_code?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  }).catch(() => null);

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
