import { NextRequest } from "next/server";

import { createMarketingBroadcast } from "@/features/email/marketing";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Only the owner can create a marketing broadcast.");
  const body = await request.json().catch(() => null) as null | {
    segment_id?: string;
    topic_id?: string;
    subject?: string;
    html?: string;
    name?: string;
    send?: boolean;
    scheduled_at?: string | null;
  };
  try {
    const broadcast = await createMarketingBroadcast({
      segmentId: body?.segment_id || "",
      topicId: body?.topic_id || "",
      subject: body?.subject || "",
      html: body?.html || "",
      name: body?.name,
      send: Boolean(body?.send),
      scheduledAt: body?.scheduled_at,
    });
    await prisma.activityLog.create({
      data: {
        actor_user_id: auth.session.user.user_id,
        entity_type: "marketing_broadcast",
        entity_id: null,
        action_key: body?.send ? "marketing.broadcast.sent" : "marketing.broadcast.draft_created",
        message: `${body?.send ? "Marketing broadcast sent" : "Marketing broadcast draft created"}: ${body?.subject || "(no subject)"}.`,
        metadata: { broadcast_id: broadcast.id, segment_id: body?.segment_id, topic_id: body?.topic_id },
      },
    });
    return apiSuccess({ broadcast_id: broadcast.id, sent: Boolean(body?.send) });
  } catch (error) {
    return apiError(502, "marketing_broadcast_failed", error instanceof Error ? error.message : "Marketing broadcast failed.");
  }
}
