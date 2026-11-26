import { NextRequest } from "next/server";

import { pushConfig } from "@/features/push/config";
import { requirePushSession } from "@/features/push/api";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/http/api-response";

/** Whether pushes are on for this CRM, and the key a browser subscribes with. */
export async function GET(request: NextRequest) {
  const auth = await requirePushSession(request);
  if (!auth.ok) return auth.response;
  const keys = pushConfig();
  const devices = keys ? await prisma.pushSubscription.count({ where: { user_id: auth.session.user.user_id } }) : 0;
  return apiSuccess({ enabled: Boolean(keys), public_key: keys?.publicKey ?? null, devices });
}
