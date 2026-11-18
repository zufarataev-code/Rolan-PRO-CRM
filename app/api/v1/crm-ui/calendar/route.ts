import type { NextRequest } from "next/server";

import { crmShellResponse } from "@/features/crm-shell/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return crmShellResponse(request, { model: "calendar", from: params.get("from") ?? "", to: params.get("to") ?? "" });
}
