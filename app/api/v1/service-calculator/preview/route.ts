import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES } from "@/features/sales/api";
import { getServiceCalculatorBootstrap } from "@/features/calculator/bootstrap";
import { calculateLineTotal, calculateSummary } from "@/features/calculator/logic";
import type { CalculatorCard } from "@/features/calculator/types";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Calculator preview denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        cards?: CalculatorCard[];
      }
    | null;

  if (!body?.cards || !Array.isArray(body.cards)) {
    return apiError(400, "invalid_payload", "cards array is required.");
  }

  const bootstrap = await getServiceCalculatorBootstrap();
  const line_items = body.cards.map((card) => {
    const line = calculateLineTotal(card, bootstrap);

    return {
      card_id: card.id,
      film_revenue: line.film_revenue,
      block_revenue: line.block_revenue,
      addons_total: line.addons_total,
      revenue_subtotal: line.revenue_subtotal,
      line_total: line.line_total,
      service_unit_price: line.service_unit_price,
      service_min_price: line.service_min_price,
      block_unit_price: line.block_unit_price,
      below_minimum_warning: line.below_minimum_warning,
      warnings: line.warnings,
      breakdown: line.breakdown,
    };
  });
  const summary = calculateSummary(body.cards, bootstrap);

  return apiSuccess({
    line_items,
    summary,
  });
}
