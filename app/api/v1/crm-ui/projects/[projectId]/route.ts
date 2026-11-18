import type { NextRequest } from "next/server";

import { crmShellResponse } from "@/features/crm-shell/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  return crmShellResponse(request, { model: "project", projectId });
}
