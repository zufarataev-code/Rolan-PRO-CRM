import { NextRequest } from "next/server";

import {
  listNotificationsForSession,
  markNotificationsReadForSession,
} from "@/features/core/notifications";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  return apiSuccess(await listNotificationsForSession(auth.session));
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  const body = (await request.json().catch(() => ({}))) as { notification_ids?: unknown };
  const notificationIds = Array.isArray(body.notification_ids)
    ? body.notification_ids.filter((id): id is string => typeof id === "string")
    : [];

  return apiSuccess(await markNotificationsReadForSession(auth.session, notificationIds));
}
