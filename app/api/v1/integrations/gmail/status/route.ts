import { NextRequest } from "next/server";

import { primaryGmailConnection } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail access denied.");
  const connection = await primaryGmailConnection();
  return apiSuccess({
    connected: Boolean(connection?.is_active),
    email_address: connection?.email_address ?? null,
    last_synced_at: connection?.last_synced_at ?? null,
    sync_error: connection?.sync_error ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail disconnect denied.");
  const connection = await primaryGmailConnection();
  if (connection) {
    const { prisma } = await import("@/lib/db");
    await prisma.gmailConnection.update({
      where: { gmail_connection_id: connection.gmail_connection_id },
      data: { is_active: false, access_token_encrypted: "disconnected", refresh_token_encrypted: "disconnected" },
    });
  }
  return apiSuccess({ disconnected: true });
}
