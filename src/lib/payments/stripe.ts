/**
 * Приём платежей через Stripe.
 *
 * Реализовано двумя запросами к REST API вместо SDK: нужны только
 * создание ссылки на оплату и проверка подписи вебхука, а библиотека
 * тянет зависимости, которых на этом сервере лучше избегать.
 *
 * Способ оплаты по умолчанию — ACH (us_bank_account). При среднем чеке
 * в несколько тысяч долларов комиссия ACH составляет 0,8% с потолком
 * 5 долларов, тогда как карта берёт 2,9% + 30 центов без потолка.
 * На договоре в 8 000 долларов разница превышает 250 долларов.
 * Карта остаётся доступной как запасной способ для небольших сумм.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export type PaymentMethodCode = "ach" | "card";

export type CheckoutInput = {
  /** Сумма в долларах. Внутрь Stripe уходит в центах. */
  amount: number;
  currency?: string;
  /** Что видит клиент в описании платежа. */
  description: string;
  /** Куда вернуть клиента после оплаты. */
  successUrl: string;
  cancelUrl: string;
  /** Проставляется в метаданные, чтобы связать платёж со сделкой. */
  metadata?: Record<string, string>;
  methods?: PaymentMethodCode[];
  customerEmail?: string | null;
};

export type CheckoutResult = {
  sessionId: string;
  url: string;
};

function requireSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();

  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return key;
}

function stripeMethodTypes(methods?: PaymentMethodCode[]) {
  const requested = methods?.length ? methods : ["ach"];

  return requested.map((method) => (method === "ach" ? "us_bank_account" : "card"));
}

/**
 * Создаёт ссылку на оплату. Возвращает адрес, который отправляется клиенту
 * в КП или в счёте на остаток.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const amountInCents = Math.round(Math.max(0, input.amount) * 100);

  if (amountInCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", (input.currency ?? "usd").toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(amountInCents));
  params.set("line_items[0][price_data][product_data][name]", input.description);

  stripeMethodTypes(input.methods).forEach((type, index) => {
    params.set(`payment_method_types[${index}]`, type);
  });

  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    params.set(`metadata[${key}]`, value);
  }

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe checkout failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const session = (await response.json()) as { id: string; url: string };

  return { sessionId: session.id, url: session.url };
}

/**
 * Проверяет подпись вебхука.
 *
 * Без этой проверки любой, кто знает адрес обработчика, мог бы отправить
 * поддельное «платёж прошёл» и перевести сделку в оплаченную.
 */
export async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  toleranceSeconds = 300,
): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret || !signatureHeader) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((chunk) => {
      const [key, value] = chunk.split("=");
      return [key?.trim(), value?.trim()];
    }),
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) {
    return false;
  }

  const timestamp = Number(parts.t);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${payload}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(parts.v1, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
