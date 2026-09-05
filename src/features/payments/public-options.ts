import { calculatePaymentAmount, isPaymentMethod, PAYMENT_METHODS, type PaymentMethod } from "@/features/payments/policy";
import { createStripeDepositCheckout, isStripeCheckoutConfigured } from "@/features/payments/stripe-checkout";
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

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isVerifiedFeeAwareCheckout(
  eventMetadata: unknown,
  depositId: string | undefined,
  payableAmount: number,
) {
  if (!depositId) return false;
  const metadata = asRecord(eventMetadata);
  if (!metadata) return false;

  return (
    metadata.deposit_id === depositId &&
    Number(metadata.fee_percent) === 3.5 &&
    Number(metadata.payable_amount) === payableAmount &&
    typeof metadata.checkout_session_id === "string" &&
    metadata.checkout_session_id.length > 0
  );
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
      proposal_events: {
        where: { event_key: "payment.checkout_created" },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { metadata: true },
      },
    },
  });

  if (!proposal) return null;

  const instructions = protectedPaymentInstructions();
  const baseAmount = money(proposal.deposit?.amount);
  const selectedMethod = isPaymentMethod(proposal.deposit?.payment_method)
    ? proposal.deposit?.payment_method
    : null;
  const onlineAmount = calculatePaymentAmount(baseAmount, PAYMENT_METHODS.PAYMENT_SYSTEM);
  const verifiedOnlineCheckout =
    selectedMethod === PAYMENT_METHODS.PAYMENT_SYSTEM &&
    isStripeCheckoutConfigured() &&
    isVerifiedFeeAwareCheckout(
      proposal.proposal_events[0]?.metadata,
      proposal.deposit?.deposit_id,
      onlineAmount.payable_amount,
    );

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
        ...onlineAmount,
        label: "Online payment",
        description: isStripeCheckoutConfigured()
          ? "Secure online checkout — the 3.5% processing fee is included in the charged amount."
          : "Online payment is temporarily unavailable until the secure processor is configured.",
        instructions: null,
        available: isStripeCheckoutConfigured(),
        payment_link: verifiedOnlineCheckout ? proposal.deposit?.payment_link ?? null : null,
      },
    ],
  };
}

export async function selectPublicPaymentMethod(accessToken: string, method: PaymentMethod) {
  const proposal = await prisma.proposal.findUnique({
    where: { access_token: accessToken },
    select: {
      proposal_id: true,
      currency: true,
      client: {
        select: { email: true },
      },
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

  const calculated = calculatePaymentAmount(money(proposal.deposit.amount), method);
  let checkout:
    | { checkoutSessionId: string; checkoutUrl: string; amountCents: number }
    | null = null;

  if (method === PAYMENT_METHODS.PAYMENT_SYSTEM) {
    const created = await createStripeDepositCheckout({
      accessToken,
      proposalId: proposal.proposal_id,
      depositId: proposal.deposit.deposit_id,
      currency: proposal.currency,
      clientEmail: proposal.client.email,
      baseAmount: calculated.base_amount,
      processingFee: calculated.processing_fee,
      payableAmount: calculated.payable_amount,
    });

    if (created === "not_configured") return "payment_processor_not_configured" as const;
    if (created === "invalid_amount") return "invalid_payment_amount" as const;
    if (created === "processor_error") return "payment_processor_error" as const;
    checkout = created;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({
      where: { deposit_id: proposal.deposit!.deposit_id },
      data: {
        payment_method: method,
        // Never reuse a generic/base-amount processor link. Online links are
        // written only after a server-created fee-aware checkout session.
        payment_link: checkout?.checkoutUrl ?? null,
      },
    });

    await tx.proposalEvent.create({
      data: {
        proposal_id: proposal.proposal_id,
        actor_type: "client",
        event_key: "payment.method_selected",
        message: `Client selected payment method: ${method}.`,
        metadata: calculated,
      },
    });

    if (checkout) {
      await tx.proposalEvent.create({
        data: {
          proposal_id: proposal.proposal_id,
          actor_type: "system",
          event_key: "payment.checkout_created",
          message: "Fee-aware secure online checkout created for the selected deposit.",
          metadata: {
            deposit_id: proposal.deposit!.deposit_id,
            checkout_session_id: checkout.checkoutSessionId,
            base_amount: calculated.base_amount,
            fee_percent: calculated.fee_percent,
            processing_fee: calculated.processing_fee,
            payable_amount: calculated.payable_amount,
            amount_cents: checkout.amountCents,
          },
        },
      });
    }
  });

  return getPublicPaymentOptions(accessToken);
}
