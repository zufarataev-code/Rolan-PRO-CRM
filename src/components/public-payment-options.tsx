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

  const methodTitle = (option: PaymentOption) =>
    ru
      ? option.method === "bank_transfer" ? "Банковский перевод" : option.method === "payment_system" ? "Картой онлайн" : option.label
      : option.method === "payment_system" ? "Card online" : option.label;

  return (
    <section id="proposal-payment" className="rp-section rp-payment">
      <div className="rp-kicker">{ru ? "Оплата" : "Payment"}</div>
      <h2 className="rp-h2">{paid ? (ru ? "Аванс получен" : "Deposit received") : (ru ? "Аванс" : "Deposit")}</h2>
      <p className="rp-lead">
        {ru ? "К оплате сейчас: " : "Due now: "}<strong>{formatMoney(baseAmount, data.currency)}</strong>
        {ru ? " · Zelle и банковский перевод — без комиссии." : " · Zelle and bank transfer have no fee."}
      </p>

      {!data.agreement_signed && !paid ? (
        <div className="rp-note">
          {ru ? "Способы оплаты откроются сразу после подписи договора." : "Payment opens right after you sign the agreement."}
        </div>
      ) : null}

      <div className="rp-pay-grid">
        {data.options.map((option) => {
          const selected = data.deposit?.selected_method === option.method;
          const blocked = !option.available || !data.agreement_signed;
          return (
            <article key={option.method} className={`rp-pay-card${selected ? " rp-pay-selected" : ""}${blocked && !paid ? " rp-pay-blocked" : ""}`}>
              <div className="rp-pay-head">
                <strong>{methodTitle(option)}</strong>
                <span>{formatMoney(option.payable_amount, data.currency)}</span>
              </div>
              <p>
                {option.processing_fee > 0
                  ? `${ru ? "Комиссия" : "Fee"} ${option.fee_percent}%: ${formatMoney(option.processing_fee, data.currency)}`
                  : ru ? "Без комиссии" : "No fee"}
              </p>

              {selected && option.instructions ? <div className="rp-pay-instructions">{option.instructions}</div> : null}

              {selected && option.method === "payment_system" && option.payment_link ? (
                <a className="rp-primary-button" href={option.payment_link}>
                  {ru ? "Перейти к безопасной оплате" : "Continue to secure payment"}
                </a>
              ) : null}

              {!option.available && !paid ? (
                <p className="rp-small">{ru ? "Этот способ пока не подключён." : "Not available yet."}</p>
              ) : null}

              {!paid && !(selected && option.method === "payment_system" && option.payment_link) ? (
                <button
                  type="button"
                  className={selected ? "rp-secondary-button" : "rp-primary-button"}
                  onClick={() => selectMethod(option)}
                  disabled={saving !== null || blocked}
                >
                  {saving === option.method
                    ? (ru ? "Подготовка…" : "Preparing…")
                    : selected
                      ? (ru ? "Выбрано" : "Selected")
                      : ru ? "Выбрать" : "Choose"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {error ? <p className="rp-error">{error}</p> : null}
    </section>
  );
}
