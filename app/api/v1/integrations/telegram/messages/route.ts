import { NextRequest } from "next/server";

import { LEGACY_WORKSPACE_VIEW_ROLES } from "@/features/legacy-crm/api";
import { getTelegramPublicStatus, sendTelegramMessage } from "@/features/telegram/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const WORKSPACE_ID = "primary";

type LegacyUser = {
  id?: unknown;
  name?: unknown;
  telegramChatId?: unknown;
  active?: unknown;
};

function legacyUsers(payload: unknown): LegacyUser[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const users = (payload as { users?: unknown }).users;
  return Array.isArray(users)
    ? users.filter((user): user is LegacyUser => Boolean(user && typeof user === "object" && !Array.isArray(user)))
    : [];
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Telegram status is for the office.");
  return apiSuccess(await getTelegramPublicStatus());
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_VIEW_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Authentication is required.");
  const body = (await request.json().catch(() => null)) as { recipient_user_id?: unknown; text?: unknown } | null;
  const recipientUserId = typeof body?.recipient_user_id === "string" ? body.recipient_user_id.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!recipientUserId || !text || text.length > 4096) {
    return apiError(400, "invalid_payload", "Recipient and message text are required.");
  }

  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: WORKSPACE_ID }, select: { payload: true } });
  if (!workspace) return apiError(404, "workspace_not_initialized", "CRM workspace is not initialized.");
  const recipient = legacyUsers(workspace.payload).find((user) => String(user.id ?? "") === recipientUserId && user.active !== false);
  if (!recipient) return apiError(404, "telegram_recipient_not_found", "Сотрудник не найден или отключён.");
  const chatId = String(recipient.telegramChatId ?? "").trim();
  if (!chatId) return apiError(409, "telegram_chat_not_linked", "У сотрудника не указан Telegram Chat ID.");

  try {
    const result = await sendTelegramMessage({ chatId, text });
    return apiSuccess({ ...result, recipient_user_id: recipientUserId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram request failed.";
    const notConfigured = message.includes("not configured");
    return apiError(notConfigured ? 503 : 502, notConfigured ? "telegram_not_configured" : "telegram_send_failed", message);
  }
}
