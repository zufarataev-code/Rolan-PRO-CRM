import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { buildCashierQuote } from "@/features/projects/cashier";
import { parseCashierInput } from "@/features/projects/cashier-payload";
import { loadCashierCatalog } from "@/features/projects/cashier-service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Пересчёт чека без сохранения: касса дёргает его на каждый тап. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Cashier access denied.");
  const parsed = parseCashierInput(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, "invalid_payload", "Cashier payload is invalid.", { errors: parsed.errors });
  const bundle = await loadCashierCatalog();
  return apiSuccess(buildCashierQuote(parsed.input, bundle.catalog));
}
