import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import { listClients } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Clients access denied.");
  }

  const data = await listClients(getManagerScope(request, auth.session));

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Client creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        phone?: string;
        email?: string;
        billing_address?: string;
        service_address?: string;
        city_id?: string;
        zip_code?: string;
        notes?: string;
      }
    | null;

  if (!body?.name?.trim()) {
    return apiError(400, "invalid_payload", "Client name is required.");
  }

  const trimmedName = body.name.trim();

  const client = await prisma.client.create({
    data: {
      name: trimmedName,
      phone: body.phone?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      billing_address: body.billing_address?.trim() || null,
      service_address: body.service_address?.trim() || null,
      city_id: body.city_id ?? null,
      zip_code: body.zip_code?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "client",
    entityId: client.client_id,
    actionKey: "client.created",
    message: `Создан клиент ${client.name}.`,
  });

  return apiSuccess({
    client_id: client.client_id,
  });
}
