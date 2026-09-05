import { getEnv } from "@/lib/env";

export type StripeDepositCheckoutInput = {
  accessToken: string;
  proposalId: string;
  depositId: string;
  currency: string;
  clientEmail?: string | null;
  baseAmount: number;
  processingFee: number;
  payableAmount: number;
};

type StripeCheckoutSessionResponse = {
  id?: string;
  url?: string | null;
  error?: {
    message?: string;
  };
};

export function isStripeCheckoutConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export async function createStripeDepositCheckout(input: StripeDepositCheckoutInput) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return "not_configured" as const;
  }

  const amountCents = Math.round(input.payableAmount * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return "invalid_amount" as const;
  }

  const appUrl = getEnv().appUrl.replace(/\/$/, "");
  const proposalUrl = `${appUrl}/proposal/${encodeURIComponent(input.accessToken)}`;
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${proposalUrl}?payment=success`);
  body.set("cancel_url", `${proposalUrl}?payment=cancelled`);
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set("line_items[0][price_data][product_data][name]", "ROLANPRO project deposit");
  body.set(
    "line_items[0][price_data][product_data][description]",
    `Deposit ${input.baseAmount.toFixed(2)} + 3.5% processing fee ${input.processingFee.toFixed(2)}`,
  );
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[proposal_id]", input.proposalId);
  body.set("metadata[deposit_id]", input.depositId);
  body.set("metadata[base_amount]", input.baseAmount.toFixed(2));
  body.set("metadata[processing_fee]", input.processingFee.toFixed(2));
  body.set("metadata[fee_percent]", "3.5");
  body.set("payment_intent_data[metadata][proposal_id]", input.proposalId);
  body.set("payment_intent_data[metadata][deposit_id]", input.depositId);
  body.set("payment_intent_data[metadata][fee_percent]", "3.5");

  const email = input.clientEmail?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    body.set("customer_email", email);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as StripeCheckoutSessionResponse | null;

  if (!response.ok || !payload?.id || !payload.url) {
    console.error("[Payments] Stripe checkout creation failed", {
      status: response.status,
      message: payload?.error?.message ?? "Unknown Stripe error",
      depositId: input.depositId,
    });
    return "processor_error" as const;
  }

  return {
    checkoutSessionId: payload.id,
    checkoutUrl: payload.url,
    amountCents,
  };
}
