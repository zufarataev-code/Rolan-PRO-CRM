import type { NextRequest } from "next/server";

import { crmShellResponse } from "@/features/crm-shell/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return crmShellResponse(request, { model: "tasks" });
}
