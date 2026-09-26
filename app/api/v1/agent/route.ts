import { NextRequest, NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth/server";
import { handleAction } from "@/lib/operations-agent";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, ["AI_SERVICE_ROLE"]);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Authorization failed." }, { status: 403 });
  }

  const { action, arguments: args, idempotency_key, request_id, initiator } = await request.json();

  const result = await handleAction({
    action,
    args,
    idempotency_key,
    request_id,
    initiator,
    user: auth.session.user,
  });

  return NextResponse.json(result);
}

