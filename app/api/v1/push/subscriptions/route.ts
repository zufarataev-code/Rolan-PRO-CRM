import { NextRequest } from "next/server";

import { pushConfig } from "@/features/push/config";
import { requirePushSession } from "@/features/push/api";
import { validBrowserSubscription } from "@/features/push/web-push";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const MAX_DEVICES_PER_USER = 10;

/** Turns pushes on for this device of the signed-in employee. */
export async function POST(request: NextRequest) {
  const auth = await requirePushSession(request);
  if (!auth.ok) return auth.response;
  if (!pushConfig()) return apiError(409, "push_disabled", "Push notifications are not set up on the server yet.");

  const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
  const subscription = validBrowserSubscription(body?.subscription);
  if (!subscription) return apiError(400, "invalid_subscription", "The browser sent an unusable push subscription.");

  const userId = auth.session.user.user_id;
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;
  // One device belongs to whoever signed in on it last.
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth, user_agent: userAgent },
    update: { user_id: userId, p256dh: subscription.p256dh, auth: subscription.auth, user_agent: userAgent, fail_count: 0 },
  });

  const devices = await prisma.pushSubscription.findMany({ where: { user_id: userId }, orderBy: { updated_at: "desc" }, select: { push_subscription_id: true } });
  const extra = devices.slice(MAX_DEVICES_PER_USER).map((device) => device.push_subscription_id);
  if (extra.length) await prisma.pushSubscription.deleteMany({ where: { push_subscription_id: { in: extra } } });

  return apiSuccess({ enabled: true, devices: Math.min(devices.length, MAX_DEVICES_PER_USER) });
}

/** Turns pushes off for this device. */
export async function DELETE(request: NextRequest) {
  const auth = await requirePushSession(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return apiError(400, "invalid_endpoint", "The device's push address is required.");
  const removed = await prisma.pushSubscription.deleteMany({ where: { endpoint, user_id: auth.session.user.user_id } });
  return apiSuccess({ removed: removed.count });
}
