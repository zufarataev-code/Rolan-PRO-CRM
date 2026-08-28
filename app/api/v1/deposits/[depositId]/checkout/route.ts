import { getSessionUser } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { createCheckoutSession, isStripeConfigured } from "@/lib/payments/stripe";

/**
 * Выдаёт клиенту ссылку на оплату аванса.
 *
 * Ссылка сохраняется в самом авансе: менеджер может отправить её повторно,
 * не создавая новый платёж, а клиент — вернуться к незавершённой оплате.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ depositId: string }> },
) {
  const session = await getSessionUser();

  if (!session) {
    return apiError(401, "unauthorized", "Требуется вход.");
  }

  if (!isStripeConfigured()) {
    return apiError(503, "payments_not_configured", "Приём платежей не настроен.");
  }

  const { depositId } = await params;

  const deposit = await prisma.deposit.findUnique({
    where: { deposit_id: depositId },
    include: {
      proposal: {
        include: {
          client: { select: { email: true, full_name: true } },
        },
      },
    },
  });

  if (!deposit) {
    return apiError(404, "not_found", "Аванс не найден.");
  }

  if (deposit.status === "paid") {
    return apiError(409, "already_paid", "Аванс уже оплачен.");
  }

  const amount = Number(deposit.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return apiError(400, "invalid_amount", "Сумма аванса не задана.");
  }

  const body = (await request.json().catch(() => null)) as { method?: "ach" | "card" } | null;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";

  try {
    const checkout = await createCheckoutSession({
      amount,
      description: `Аванс по предложению ${deposit.proposal.proposal_code ?? deposit.proposal.title}`,
      successUrl: `${appUrl}/proposal/${deposit.proposal.access_token}?payment=success`,
      cancelUrl: `${appUrl}/proposal/${deposit.proposal.access_token}?payment=cancelled`,
      customerEmail: deposit.proposal.client.email,
      methods: body?.method ? [body.method] : ["ach"],
      metadata: {
        deposit_id: deposit.deposit_id,
        proposal_id: deposit.proposal_id,
      },
    });

    const updated = await prisma.deposit.update({
      where: { deposit_id: deposit.deposit_id },
      data: {
        payment_method: body?.method ?? "ach",
        payment_link: checkout.url,
      },
      select: { deposit_id: true, payment_method: true, payment_link: true },
    });

    return apiSuccess(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать ссылку на оплату.";
    return apiError(502, "stripe_error", message);
  }
}
