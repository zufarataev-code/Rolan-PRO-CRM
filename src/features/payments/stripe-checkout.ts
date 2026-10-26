import { getEnv } from "@/lib/env";
import { PAYMENT_SYSTEM_FEE_PERCENT } from "@/features/payments/policy";
import { getStripeSecretKey } from "@/features/payments/stripe-settings";

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
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
  error?: {
    message?: string;
  };
};

export async function isStripeCheckoutConfigured() {
  return Boolean(await getStripeSecretKey());
}

export async function createStripeDepositCheckout(input: StripeDepositCheckoutInput) {
  const secretKey = await getStripeSecretKey();
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
  // Stripe replaces this placeholder after payment. The public return page
  // verifies that exact session server-side before CRM records any money.
  body.set("success_url", `${proposalUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${proposalUrl}?payment=cancelled`);
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set("line_items[0][price_data][product_data][name]", "ROLANPRO project deposit");
  body.set(
    "line_items[0][price_data][product_data][description]",
    `Deposit ${input.baseAmount.toFixed(2)} + ${PAYMENT_SYSTEM_FEE_PERCENT}% card processing fee ${input.processingFee.toFixed(2)}`,
  );
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[proposal_id]", input.proposalId);
  body.set("metadata[deposit_id]", input.depositId);
  body.set("metadata[base_amount]", input.baseAmount.toFixed(2));
  body.set("metadata[processing_fee]", input.processingFee.toFixed(2));
  body.set("metadata[fee_percent]", String(PAYMENT_SYSTEM_FEE_PERCENT));
  body.set("payment_intent_data[metadata][proposal_id]", input.proposalId);
  body.set("payment_intent_data[metadata][deposit_id]", input.depositId);
  body.set("payment_intent_data[metadata][fee_percent]", String(PAYMENT_SYSTEM_FEE_PERCENT));

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

export async function getStripeCheckoutSession(checkoutSessionId: string) {
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(checkoutSessionId)) {
    return "invalid_session" as const;
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) return "not_configured" as const;

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as StripeCheckoutSessionResponse | null;

  if (!response.ok || !payload?.id) {
    console.error("[Payments] Stripe checkout verification failed", {
      status: response.status,
      message: payload?.error?.message ?? "Unknown Stripe error",
      checkoutSessionId,
    });
    return "processor_error" as const;
  }

  return {
    checkoutSessionId: payload.id,
    paymentStatus: payload.payment_status ?? null,
    amountTotal: payload.amount_total ?? null,
    currency: payload.currency?.toUpperCase() ?? null,
    metadata: payload.metadata ?? {},
  };
}

async function stripeRequest(secretKey: string, path: string, init: { method?: string; body?: URLSearchParams } = {}) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${secretKey}`, ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: init.body?.toString(),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> & { error?: { message?: string } } | null;
  if (!response.ok || !payload) throw new Error(`Stripe: ${payload?.error?.message ?? response.status}`);
  return payload;
}

/**
 * A Stripe Payment Link for a CRM project, made on the server (the browser
 * used to call Stripe with the secret key itself).
 */
export async function createStripeProjectPaymentLink(input: { orderId: string; orderNumber: string; amount: number; description: string; currency?: string }) {
  const secretKey = await getStripeSecretKey();
  if (!secretKey) return "not_configured" as const;
  const cents = Math.round(Number(input.amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return "invalid_amount" as const;
  const currency = /^[a-z]{3}$/.test(String(input.currency ?? "").toLowerCase()) ? String(input.currency).toLowerCase() : "usd";
  const product = await stripeRequest(secretKey, "products", { method: "POST", body: new URLSearchParams({ name: input.description.slice(0, 250) || "ROLANPRO project" }) });
  const price = await stripeRequest(secretKey, "prices", { method: "POST", body: new URLSearchParams({ unit_amount: String(cents), currency, product: String(product.id) }) });
  const link = await stripeRequest(secretKey, "payment_links", {
    method: "POST",
    body: new URLSearchParams({
      "line_items[0][price]": String(price.id),
      "line_items[0][quantity]": "1",
      "metadata[order_id]": input.orderId.slice(0, 100),
      "metadata[order_number]": input.orderNumber.slice(0, 100),
    }),
  });
  return { url: String(link.url), id: String(link.id), priceId: String(price.id), productId: String(product.id) };
}

/** Paid checkout session ids by payment link id (null — not paid yet). */
export async function findPaidStripePaymentLinks(paymentLinkIds: string[]) {
  const secretKey = await getStripeSecretKey();
  if (!secretKey) return "not_configured" as const;
  const result: Record<string, string | null> = {};
  for (const id of paymentLinkIds.filter((value) => /^plink_[A-Za-z0-9]+$/.test(value)).slice(0, 50)) {
    const sessions = await stripeRequest(secretKey, `checkout/sessions?payment_link=${encodeURIComponent(id)}&limit=10`);
    const paid = (Array.isArray(sessions.data) ? sessions.data : []).find((session: { payment_status?: string }) => session?.payment_status === "paid") as { id?: string } | undefined;
    result[id] = paid?.id ?? null;
  }
  return result;
}
