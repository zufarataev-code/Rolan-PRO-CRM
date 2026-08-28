import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/stripe";

/**
 * Обработчик уведомлений Stripe.
 *
 * Отмечает оплаченный аванс в CRM. Подпись проверяется обязательно:
 * без неё любой запрос на этот адрес мог бы перевести сделку в оплаченную.
 *
 * ACH-платежи подтверждаются не мгновенно — списание со счёта идёт
 * несколько рабочих дней. Поэтому обрабатывается именно
 * checkout.session.completed вместе с payment_status: "paid",
 * а не сам факт создания сессии.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  const isValid = await verifyWebhookSignature(payload, signature);

  if (!isValid) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true, handled: false });
  }

  const session = event.data?.object ?? {};
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const depositId = metadata.deposit_id;
  const paymentStatus = session.payment_status;

  if (!depositId || paymentStatus !== "paid") {
    return Response.json({ received: true, handled: false });
  }

  const deposit = await prisma.deposit.findUnique({
    where: { deposit_id: depositId },
    select: { deposit_id: true, status: true, proposal_id: true },
  });

  if (!deposit) {
    return Response.json({ received: true, handled: false });
  }

  // Stripe повторяет доставку уведомлений при сбоях, поэтому повторная
  // обработка уже оплаченного аванса не должна ничего менять.
  if (deposit.status === "paid") {
    return Response.json({ received: true, handled: true, duplicate: true });
  }

  await prisma.deposit.update({
    where: { deposit_id: deposit.deposit_id },
    data: {
      status: "paid",
      paid_at: new Date(),
      payment_reference: typeof session.id === "string" ? session.id : null,
    },
  });

  await prisma.proposalEvent.create({
    data: {
      proposal_id: deposit.proposal_id,
      actor_type: "system",
      event_key: "deposit_paid",
      message: "Аванс оплачен через Stripe",
      metadata: {
        source: "stripe",
        session_id: typeof session.id === "string" ? session.id : null,
        amount_total: session.amount_total ?? null,
        payment_method_types: session.payment_method_types ?? null,
      },
    },
  });

  return Response.json({ received: true, handled: true });
}
