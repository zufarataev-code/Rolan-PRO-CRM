import { NextRequest } from "next/server";

import { DEPOSIT_STATUSES, PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { approveProposal, createDepositForProposal, markDepositPaid } from "@/features/proposals/service";
import { closeSaleIfReady } from "@/features/sales/close-sale";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ proposalId: string }> };

/**
 * Manager confirms a KP on the client's behalf (temporary until clients sign
 * online). One server step so PostgreSQL and the CRM never disagree:
 * - approve the proposal;
 * - "deposit": the Deposit gets exactly the received amount and is paid;
 * - "after_completion": an obsolete unpaid Deposit is removed (no reminders);
 * - "later": nothing else.
 * Safe to repeat: an approved proposal / paid deposit is left as is.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal confirmation denied.");

  const { proposalId } = await context.params;
  const body = (await request.json().catch(() => null)) as { payment?: string; amount?: number } | null;
  const payment = body?.payment;
  if (payment !== "deposit" && payment !== "after_completion" && payment !== "later") {
    return apiError(400, "invalid_payload", "payment must be deposit, after_completion or later.");
  }
  const amount = Number(body?.amount);
  if (payment === "deposit" && !(amount > 0)) {
    return apiError(400, "invalid_amount", "Deposit amount must be greater than zero.");
  }

  const approved = await approveProposal(auth.session, proposalId);
  if (!approved) return apiError(404, "not_found", "Proposal was not found.");
  if (approved === "missing_selection") {
    return apiError(409, "missing_selection", "At least one selected proposal item is required before approval.");
  }

  const existing = await prisma.deposit.findFirst({ where: { proposal_id: proposalId } });

  if (payment === "after_completion") {
    if (existing && existing.status !== DEPOSIT_STATUSES.PAID) {
      await prisma.deposit.delete({ where: { deposit_id: existing.deposit_id } });
    }
    return apiSuccess({ proposal_id: proposalId, payment });
  }

  if (payment === "later") {
    return apiSuccess({ proposal_id: proposalId, payment });
  }

  let depositId = existing?.deposit_id;
  if (existing && existing.status === DEPOSIT_STATUSES.PAID) {
    if (Math.abs(Number(existing.amount) - amount) > 0.009) {
      return apiError(409, "deposit_already_paid", "A different deposit amount is already recorded as paid.");
    }
    return apiSuccess({ proposal_id: proposalId, payment, deposit_id: existing.deposit_id });
  }
  if (existing) {
    // Publishing created a pending Deposit for the planned amount; record the amount actually received.
    await prisma.deposit.update({ where: { deposit_id: existing.deposit_id }, data: { amount } });
  } else {
    const created = await createDepositForProposal(auth.session, { proposal_id: proposalId, amount });
    if (!created || typeof created === "string") {
      return apiError(409, "deposit_not_created", "Deposit could not be created.");
    }
    depositId = created.deposit.deposit_id;
  }

  const paid = await markDepositPaid(auth.session, depositId!);
  if (!paid || typeof paid === "string") {
    return apiError(409, "deposit_not_paid", "Deposit could not be marked paid.");
  }
  const sale = await closeSaleIfReady({ depositId: depositId!, actorUserId: auth.session.user.user_id });
  return apiSuccess({ proposal_id: proposalId, payment, deposit_id: depositId, sale });
}
