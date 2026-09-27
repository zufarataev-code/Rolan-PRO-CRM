import { NextRequest, NextResponse } from "next/server";
//requireRequestSession больше не нужен для /api/v1/agent
//защита обеспечивается HMAC и CRM_OPERATIONS_AGENT_SECRET
import { handleAction } from "@/lib/operations-agent";

export async function POST(request: NextRequest) {
  const authResult = await verifyHMAC(request);

  if (!authResult.ok) {
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

