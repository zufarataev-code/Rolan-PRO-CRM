import { calculatePaymentAmount, isPaymentMethod, PAYMENT_METHODS, type PaymentMethod } from "@/features/payments/policy";
import { prisma } from "@/lib/db";

function money(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

function protectedPaymentInstructions() {
  return {
    zelle_recipient: process.env.ROLANPRO_ZELLE_RECIPIENT?.trim() || null,
    bank_transfer_instructions: process.env.ROLANPRO_BANK_TRANSFER_INSTRUCTIONS?.trim() || null,
  };
}

export async function getPublicPaymentOptions(accessToken: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { access_token: accessToken },
    select: {
      proposal_id: true,
      currency: true,
      agreement: {
        select: { status: true, signed_at: true },
      },
      deposit: {
        select: {
          deposit_id: true,
          amount: true,
          status: true,
          paid_at: true,
          payment_method: true,
          payment_link: true,
        },
      },
    },
  });

  if (!proposal) return null;

  const instructions = protectedPaymentInstructions();
  const baseAmount = money(proposal.deposit?.amount);
  const selectedMethod = isPaymentMethod(proposal.deposit?.payment_method)
    ? proposal.deposit?.payment_method
    : null;

  return {
    proposal_id: proposal.proposal_id,
    currency: proposal.currency,
    agreement_signed: proposal.agreement?.status === "signed" && Boolean(proposal.agreement.signed_at),
    deposit: proposal.deposit
      ? {
          deposit_id: proposal.deposit.deposit_id,
          status: proposal.deposit.status,
          paid_at: proposal.deposit.paid_at,
          selected_method: selectedMethod,
          base_amount: baseAmount,
        }
      : null,
    options: [
      {
        ...calculatePaymentAmount(baseAmount, PAYMENT_METHODS.ZELLE),
        label: "Zelle",
        description: "Preferred — no processing fee.",
        instructions: instructions.zelle_recipient,
        available: Boolean(instructions.zelle_recipient),
        payment_link: null,
      },
      {
        ...calculatePaymentAmount(baseAmount, PAYMENT_METHODS.BANK_TRANSFER),
        label: "Bank transfer",
        description: "Preferred — no processing fee.",
        instructions: instructions.bank_transfer_instructions,
        available: Boolean(instructions.bank_transfer_instructions),
        payment_link: null,
      },
      {
        ...calculatePaymentAmount(baseAmount, PAYMENT_METHODS.PAYMENT_SYSTEM),
        label: "Online payment",
        description: "Online processor — 3.5% processing fee applies.",
        instructions: null,
        available: Boolean(proposal.deposit?.payment_link),
        payment_link: proposal.deposit?.payment_link ?? null,
      },
    ],
  };
}

export async function selectPublicPaymentMethod(accessToken: string, method: PaymentMethod) {
  const proposal = await prisma.proposal.findUnique({
    where: { access_token: accessToken },
    select: {
      proposal_id: true,
      deposit: {
        select: {
          deposit_id: true,
          amount: true,
          status: true,
        },
      },
    },
  });

  if (!proposal) return null;
  if (!proposal.deposit) return "deposit_not_ready" as const;
  if (proposal.deposit.status === "paid") return "deposit_already_paid" as const;

  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({
      where: { deposit_id: proposal.deposit!.deposit_id },
      data: { payment_method: method },
    });

    await tx.proposalEvent.create({
      data: {
        proposal_id: proposal.proposal_id,
        actor_type: "client",
        event_key: "payment.method_selected",
        message: `Client selected payment method: ${method}.`,
        metadata: calculatePaymentAmount(money(proposal.deposit!.amount), method),
      },
    });
  });

  return getPublicPaymentOptions(accessToken);
}
