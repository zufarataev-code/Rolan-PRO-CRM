import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES } from "@/features/sales/api";
import {
  getServiceCalculatorBootstrap,
  withoutInternalCalculatorCosts,
} from "@/features/calculator/bootstrap";
import { ROLE_CODES } from "@/lib/auth/constants";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Calculator bootstrap denied.");
  }

  const bootstrap = await getServiceCalculatorBootstrap();
  const salesBootstrap = auth.session.roles.includes(ROLE_CODES.OWNER)
    ? bootstrap
    : withoutInternalCalculatorCosts(bootstrap);

  return apiSuccess(salesBootstrap);
}
