import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { buildClientReuseWhere, getRecordManagerScope } from "@/features/sales/access";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import {
  findExistingClientByIdentity,
  lockClientIdentity,
  normalizeClientEmail,
} from "@/features/sales/client-identity";
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

  const contact = {
    phone: body.phone?.trim() || null,
    email: normalizeClientEmail(body.email) || null,
  };
  const result = await prisma.$transaction(async (tx) => {
    await lockClientIdentity(tx, contact);
    const existing = await findExistingClientByIdentity(tx, contact);
    if (existing) {
      // Another manager's customer: refuse without revealing who it is.
      const managerId = getRecordManagerScope(auth.session);
      const ids = [existing.client.client_id, existing.conflictingClient?.client_id].filter(Boolean) as string[];
      const visible = await tx.client.count({
        where: { ...buildClientReuseWhere(managerId), client_id: { in: ids } },
      });
      if (visible < ids.length) return { hidden: true } as const;
    }
    if (existing && existing.conflictingClient) {
      return {
        conflict: { emailClientId: existing.client.client_id, phoneClientId: existing.conflictingClient.client_id },
      } as const;
    }
    if (existing) {
      return { client: existing.client, reused: true, matchedBy: existing.matchedBy } as const;
    }

    const client = await tx.client.create({
      data: {
        name: trimmedName,
        phone: contact.phone,
        email: contact.email,
        billing_address: body.billing_address?.trim() || null,
        service_address: body.service_address?.trim() || null,
        city_id: body.city_id ?? null,
        zip_code: body.zip_code?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    return { client, reused: false, matchedBy: null } as const;
  });

  if ("hidden" in result) {
    return apiError(
      409,
      "client_owned_by_other_manager",
      "Клиент с таким телефоном или почтой уже есть в CRM у другого менеджера. Обратитесь к руководителю.",
    );
  }

  if (result.conflict) {
    return apiError(
      409,
      "client_identity_conflict",
      "Телефон и почта принадлежат двум разным клиентам. Выберите клиента вручную.",
      {
        email_client_id: result.conflict.emailClientId,
        phone_client_id: result.conflict.phoneClientId,
      },
    );
  }

  const { client } = result;

  if (!result.reused) {
    await logSalesActivity({
      actorUserId: auth.session.user.user_id,
      entityType: "client",
      entityId: client.client_id,
      actionKey: "client.created",
      message: `Создан клиент ${client.name}.`,
    });
  }

  return apiSuccess({
    client_id: client.client_id,
    client_name: client.name,
    reused: result.reused,
    matched_by: result.matchedBy,
  });
}
