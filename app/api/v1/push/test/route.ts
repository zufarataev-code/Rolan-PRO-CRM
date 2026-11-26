import { NextRequest } from "next/server";

import { pushConfig } from "@/features/push/config";
import { requirePushSession } from "@/features/push/api";
import { sendToUser } from "@/features/push/dispatcher";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const lastTest = new Map<string, number>();

/** Sends a test push to every device the signed-in employee turned on. */
export async function POST(request: NextRequest) {
  const auth = await requirePushSession(request);
  if (!auth.ok) return auth.response;
  const keys = pushConfig();
  if (!keys) return apiError(409, "push_disabled", "Push notifications are not set up on the server yet.");

  const userId = auth.session.user.user_id;
  const now = Date.now();
  if (now - (lastTest.get(userId) ?? 0) < 10_000) return apiError(429, "too_many_tests", "Wait a few seconds before the next test.");
  lastTest.set(userId, now);

  const results = await sendToUser(userId, { title: "RolanPRO", body: "Уведомления работают на этом устройстве.", url: "/legacy-crm", tag: `test:${now}` }, keys);
  if (!results.length) return apiError(404, "no_devices", "Push notifications are not turned on for any device yet.");
  const sent = results.filter((result) => result.ok).length;
  // Nothing got through (every service refused or timed out): not a success.
  if (!sent) return apiError(502, "push_failed", "The push service did not accept the test notification.");
  return apiSuccess({ sent, devices: results.length });
}
