"use client";

import { useEffect, useState } from "react";

type PaymentOption = {
  method: string;
  label: string;
  description: string;
  base_amount: number;
  fee_percent: number;
  processing_fee: number;
  payable_amount: number;
  instructions: string | null;
  available: boolean;
  payment_link: string | null;
};

type PaymentData = {
  reference?: string | null;
  currency: string;
  agreement_signed: boolean;
  suggested_base_amount: number;
  deposit: {
    deposit_id: string;
    status: string;
    paid_at: string | Date | null;
    selected_method: string | null;
    base_amount: number;
  } | null;
  options: PaymentOption[];
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

export function PublicPaymentOptions({
  accessToken,
  initialData,
  language = "en",
  refreshKey = 0,
}: {
  accessToken: string;
  initialData: PaymentData;
  language?: "en" | "ru";
  refreshKey?: number;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (refreshKey === 0) return;
    void fetch(`/api/public/proposals/${accessToken}/payments`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.data) setData(payload.data);
      });
  }, [accessToken, refreshKey]);

  const ru = language === "ru";
  const paid = data.deposit?.status === "paid";
  const baseAmount = data.deposit?.base_amount ?? data.suggested_base_amount;

  async function selectMethod(option: PaymentOption, redirectToCheckout = false) {
    if (paid || !option.available) return;
    setSaving(option.method);
    setError(null);
    try {
      const response = await fetch(`/api/public/proposals/${accessToken}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: option.method }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.errors?.[0]?.message || payload?.error?.message || (ru ? "Не удалось выбрать способ оплаты." : "Unable to select payment method."),
        );
      }
      if (!payload?.data) throw new Error(ru ? "Ответ сервера оплаты неполный." : "Incomplete payment response.");
      setData(payload.data);
      if (redirectToCheckout && option.method === "payment_system") {
        // Create a fresh Checkout Session for every explicit payment click.
        // Cached session URLs can expire and must never be reused here.
        const freshCheckout = payload.data.options?.find(
          (candidate: PaymentOption) => candidate.method === "payment_system",
        )?.payment_link;
        if (typeof freshCheckout !== "string" || !freshCheckout.startsWith("https://checkout.stripe.com/")) {
          throw new Error(ru ? "Не удалось создать новую ссылку оплаты." : "Unable to create a new payment link.");
        }
        window.location.assign(freshCheckout);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (ru ? "Не удалось выбрать способ оплаты." : "Unable to select payment method."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section id="proposal-payment" className="proposal-section proposal-payment-section">
      <div className="proposal-section-kicker">{ru ? "Оплата" : "Payment"}</div>
      <h2>{paid ? (ru ? "Оплата получена" : "Deposit received") : (ru ? "Оплатить проект" : "Pay for your project")}</h2>
      {paid ? (
        <p>
          {ru ? "Аванс получен: " : "Deposit received: "}<strong>{formatMoney(baseAmount, data.currency)}</strong>.{" "}
          {ru ? "Спасибо! Менеджер свяжется с вами, чтобы согласовать дату монтажа." : "Thank you! Your project manager will contact you to schedule the installation."}
        </p>
      ) : (
        <p>
          {ru ? "Сумма к оплате сейчас: " : "Amount due now: "}<strong>{formatMoney(baseAmount, data.currency)}</strong>.{" "}
          {ru
            ? "Zelle и банковский перевод — без комиссии. При оплате картой добавляется комиссия за обработку карты 3%."
            : "Zelle and bank transfer have no fee. Paying by card adds a 3% card processing fee."}
        </p>
      )}

      {!data.agreement_signed && !paid ? (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "rgba(37,99,235,.08)" }}>
          <strong>{ru ? "Сначала подпишите КП" : "Sign the proposal first"}</strong>
          <div style={{ marginTop: 4, opacity: 0.78 }}>
            {ru
              ? "После подписи кнопки оплаты станут активными автоматически."
              : "Payment buttons become active automatically after signature."}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {data.options.map((option) => {
          const selected = data.deposit?.selected_method === option.method;
          return (
            <div
              key={option.method}
              style={{
                border: selected ? "2px solid currentColor" : "1px solid rgba(15,23,42,.14)",
                borderRadius: 16,
                padding: 16,
                opacity: option.available || paid ? 1 : 0.62,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <strong>{ru && option.method === "bank_transfer" ? "Банковский перевод" : ru && option.method === "payment_system" ? "Оплата картой" : option.label}</strong>
                  <div style={{ opacity: 0.72, marginTop: 4 }}>
                    {ru
                      ? option.method === "payment_system"
                        ? "Безопасная онлайн-оплата; комиссия включается в итоговую сумму."
                        : "Предпочтительный способ — без комиссии."
                      : option.description}
                  </div>
                </div>
                <strong>{formatMoney(option.payable_amount, data.currency)}</strong>
              </div>

              {option.processing_fee > 0 ? (
                <div style={{ marginTop: 8 }}>
                  {ru ? "Комиссия" : "Processing fee"} {option.fee_percent}%: {formatMoney(option.processing_fee, data.currency)}
                </div>
              ) : null}

              {selected && option.instructions ? (
                <div style={{ marginTop: 12, whiteSpace: "pre-wrap", padding: 12, borderRadius: 12, background: "#f1f5f9", lineHeight: 1.5 }}>
                  {option.method === "zelle" ? (
                    <>
                      <b>{ru ? `Переведите ${formatMoney(option.payable_amount, data.currency)} через Zelle` : `Send ${formatMoney(option.payable_amount, data.currency)} with Zelle`}</b>
                      <br />
                      {ru ? "Получатель: " : "To: "}<b>{option.instructions}</b>
                      {data.reference ? (<><br />{ru ? "В комментарии укажите: " : "Memo: "}<b>{data.reference}</b></>) : null}
                      <br />
                      <span style={{ opacity: 0.75 }}>{ru ? "Мы подтвердим поступление и напишем вам." : "We confirm the payment and let you know."}</span>
                    </>
                  ) : (
                    <>
                      {option.instructions}
                      {data.reference ? (<><br />{ru ? "Назначение платежа: " : "Reference: "}<b>{data.reference}</b></>) : null}
                    </>
                  )}
                </div>
              ) : null}

              {selected && option.method === "payment_system" && option.available && !paid ? (
                <button
                  type="button"
                  className="proposal-pay-link"
                  onClick={() => void selectMethod(option, true)}
                  disabled={saving !== null || !data.agreement_signed}
                  style={{ display: "inline-block", marginTop: 14 }}
                >
                  {saving === option.method
                    ? (ru ? "Создаём безопасную оплату…" : "Preparing secure checkout…")
                    : ru
                      ? `Оплатить ${formatMoney(option.payable_amount, data.currency)} картой →`
                      : `Pay ${formatMoney(option.payable_amount, data.currency)} by card →`}
                </button>
              ) : null}

              {!option.available && !paid ? (
                <div style={{ marginTop: 12, opacity: 0.72 }}>{ru ? "Этот способ оплаты пока не настроен." : "This payment method is not configured yet."}</div>
              ) : null}

              {!paid && !(selected && option.method === "payment_system" && option.available) ? (
                <button
                  type="button"
                  onClick={() => void selectMethod(option, option.method === "payment_system")}
                  disabled={saving !== null || !option.available || !data.agreement_signed}
                  style={{ marginTop: 14 }}
                >
                  {saving === option.method
                    ? (ru ? "Подготовка…" : "Preparing…")
                    : !option.available
                      ? (ru ? "Недоступно" : "Unavailable")
                      : !data.agreement_signed
                        ? (ru ? "Сначала подпишите КП" : "Sign proposal first")
                      : selected
                        ? (ru ? "Выбрано" : "Selected")
                        : ru
                          ? option.method === "payment_system" ? "Оплатить картой" : option.method === "bank_transfer" ? "Выбрать банковский перевод" : "Выбрать Zelle"
                          : `Choose ${option.label}`}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p> : null}
    </section>
  );
}
