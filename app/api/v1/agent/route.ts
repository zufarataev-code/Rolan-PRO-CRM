import { NextRequest, NextResponse } from "next/server";

import {
  OPERATIONS_AGENT_SIGNATURE_HEADER,
  OPERATIONS_AGENT_TIMESTAMP_HEADER,
  verifyOperationsAgentSignature,
} from "@/lib/operations-agent/auth";
import {
  handleOperationsAgentAction,
  resolveOperationsAgentActor,
  type OperationsAgentResult,
} from "@/lib/operations-agent";

function statusForResult(result: OperationsAgentResult) {
  if (result.error?.code === "idempotency_conflict") return 409;
  if (result.ok || result.needs_clarification || result.requires_approval || result.duplicate) return 200;
  if (result.error?.code === "not_found") return 404;
  if (result.error?.code === "action_failed") return 500;
  return 400;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRM_OPERATIONS_AGENT_SECRET?.trim();

  if (!secret || secret.length < 32) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "integration_not_configured",
          message: "CRM Operations Agent is not configured.",
        },
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const validSignature = verifyOperationsAgentSignature(
    rawBody,
    request.headers.get(OPERATIONS_AGENT_TIMESTAMP_HEADER),
    request.headers.get(OPERATIONS_AGENT_SIGNATURE_HEADER),
    secret,
  );

  if (!validSignature) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_signature",
          message: "CRM Operations Agent signature is invalid or expired.",
        },
      },
      { status: 401 },
    );
  }

  let body: {
    action?: unknown;
    arguments?: unknown;
    idempotency_key?: unknown;
    request_id?: unknown;
  };

  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_json", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string" ? body.action : "";
  const args =
    body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
      ? (body.arguments as Record<string, unknown>)
      : {};
  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 191) : null;

  const actor = await resolveOperationsAgentActor();

  if (!actor) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "actor_not_configured",
          message: "CRM Operations Agent actor is not configured as an active owner or manager.",
        },
      },
      { status: 503 },
    );
  }

  const result = await handleOperationsAgentAction({
    action,
    args,
    idempotencyKey,
    requestId,
    initiator: "owner-via-chatgpt",
    actor,
  });

  return NextResponse.json(result, { status: statusForResult(result) });
}
