import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { buildProcurementMessage, sendProcurementEmail } from "@/features/email/procurement";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;
type JsonObject = Record<string, unknown>;

function apiFailure(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Procurement email access denied.");
  const body = await request.json().catch(() => null) as null | { purchase_request_id?: string; expected_revision?: number };
  const purchaseRequestId = body?.purchase_request_id?.trim() || "";
  const expectedRevision = body?.expected_revision;
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(purchaseRequestId) || !Number.isInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return apiError(400, "invalid_payload", "A valid purchase request id and workspace revision are required.");
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ payload: Prisma.JsonValue; revision: number }>>(
        Prisma.sql`SELECT payload, revision FROM legacy_workspaces WHERE workspace_id = 'primary' FOR UPDATE`,
      );
      const workspace = rows[0];
      if (!workspace) throw apiFailure(404, "workspace_not_initialized", "CRM workspace is not initialized.");
      if (workspace.revision !== expectedRevision) {
        throw apiFailure(409, "revision_conflict", "CRM data changed in another browser. Refresh before sending.");
      }
      const payload = structuredClone(workspace.payload) as JsonObject;
      const requests = Array.isArray(payload.purchaseRequests) ? payload.purchaseRequests as JsonObject[] : [];
      const vendors = Array.isArray(payload.vendors) ? payload.vendors as JsonObject[] : [];
      const purchaseRequest = requests.find((item) => String(item.id || "") === purchaseRequestId);
      if (!purchaseRequest) throw apiFailure(404, "purchase_request_not_found", "Purchase request was not found.");
      if (purchaseRequest.status !== "draft") throw apiFailure(409, "purchase_request_not_draft", "Only a draft purchase request can be sent.");
      const vendor = vendors.find((item) => String(item.id || "") === String(purchaseRequest.vendorId || ""));
      if (!vendor) throw apiFailure(400, "supplier_not_found", "Assign a supplier before sending.");
      const to = String(vendor.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw apiFailure(400, "supplier_email_missing", "Supplier has no confirmed email.");
      const message = buildProcurementMessage(purchaseRequest, vendor);
      const sent = await sendProcurementEmail({
        to,
        subject: message.subject,
        text: message.text,
        idempotencyKey: `procurement-${purchaseRequestId}`,
      });
      const now = new Date().toISOString();
      purchaseRequest.status = "requested";
      purchaseRequest.responsibleId = purchaseRequest.responsibleId || auth.session.user.legacy_user_ids[0] || null;
      purchaseRequest.sentAt = now;
      purchaseRequest.sentBy = auth.session.user.legacy_user_ids[0] || null;
      purchaseRequest.providerMessageId = sent.id;
      purchaseRequest.updatedAt = now;
      const history = Array.isArray(vendor.requestHistory) ? vendor.requestHistory as JsonObject[] : [];
      history.unshift({ purchaseRequestId, number: purchaseRequest.number, at: now, by: purchaseRequest.sentBy, to, status: "sent" });
      vendor.requestHistory = history;
      const updated = await tx.legacyWorkspace.update({
        where: { workspace_id: "primary" },
        data: { payload: payload as Prisma.InputJsonValue, revision: { increment: 1 }, updated_by: auth.session.user.user_id },
        select: { revision: true },
      });
      await tx.activityLog.create({
        data: {
          actor_user_id: auth.session.user.user_id,
          entity_type: "purchase_request",
          entity_id: null,
          action_key: "procurement.request.sent",
          message: `Purchase request sent to ${to}.`,
          metadata: { purchase_request_id: purchaseRequestId, provider: "resend", provider_message_id: sent.id },
        },
      });
      return { messageId: sent.id, revision: updated.revision };
    }, { maxWait: 5_000, timeout: 30_000 });
    return apiSuccess({ message_id: result.messageId, workspace_revision: result.revision });
  } catch (error) {
    const failure = error as Error & { status?: number; code?: string };
    return apiError(failure.status || 502, failure.code || "procurement_email_failed", failure.message || "Procurement email failed.");
  }
}
