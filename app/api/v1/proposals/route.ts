import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import {
  createProposalFromCalculator,
  createProposalFromSurvey,
  getProposalList,
  getSurveyReadyDeals,
} from "@/features/proposals/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal list access denied.");
  }

  const [proposals, surveyReadyDeals] = await Promise.all([
    getProposalList(auth.session),
    getSurveyReadyDeals(auth.session),
  ]);

  return apiSuccess({
    proposals,
    survey_ready_deals: surveyReadyDeals,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        deal_id?: string;
        survey_id?: string | null;
        title?: string | null;
        calculator_cards?: unknown;
      }
    | null;

  if (!body?.deal_id) {
    return apiError(400, "invalid_payload", "deal_id is required.");
  }

  const proposal =
    body.calculator_cards !== undefined
      ? await createProposalFromCalculator(auth.session, {
          deal_id: body.deal_id,
          title: body.title ?? null,
          calculator_cards: body.calculator_cards,
        })
      : await createProposalFromSurvey(auth.session, {
          deal_id: body.deal_id,
          survey_id: body.survey_id ?? null,
          title: body.title ?? null,
        });

  if (proposal === "empty_calculator") {
    return apiError(400, "empty_calculator", "Добавьте хотя бы одну услугу в calculator.");
  }

  if (!proposal) {
    return apiError(404, "not_found", "Deal with proposal context was not found.");
  }

  return apiSuccess({
    proposal,
  });
}
