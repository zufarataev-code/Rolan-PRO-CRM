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

  async function selectMethod(option: PaymentOption) {
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
      setData(payload.data);
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
      <p>
        {ru ? "Сумма к оплате сейчас: " : "Amount due now: "}<strong>{formatMoney(baseAmount, data.currency)}</strong>.{" "}
        {ru
          ? "Zelle и банковский перевод — без комиссии. При оплате картой защищённая форма добавит комиссию 3,5%."
          : "Zelle and bank transfer have no processing fee. Secure online payment includes a 3.5% processing fee."}
      </p>

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
                <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{option.instructions}</div>
              ) : null}

              {selected && option.method === "payment_system" && option.payment_link ? (
                <a href={option.payment_link} style={{ display: "inline-block", marginTop: 12 }}>
                  {ru ? "Перейти к безопасной оплате" : "Continue to secure payment"}
                </a>
              ) : null}

              {selected && option.method === "payment_system" && option.available && !option.payment_link ? (
                <div style={{ marginTop: 12, opacity: 0.72 }}>
                  {ru
                    ? "Безопасная форма оплаты готовится. Нажмите «Оплата картой» ещё раз, если нужна новая сессия."
                    : "Secure checkout is being prepared. Choose Online payment again if you need a new payment session."}
                </div>
              ) : null}

              {!option.available && !paid ? (
                <div style={{ marginTop: 12, opacity: 0.72 }}>{ru ? "Этот способ оплаты пока не настроен." : "This payment method is not configured yet."}</div>
              ) : null}

              {!paid ? (
                <button
                  type="button"
                  onClick={() => selectMethod(option)}
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
