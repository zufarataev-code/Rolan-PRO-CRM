"use client";

import { useState } from "react";

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
}: {
  accessToken: string;
  initialData: PaymentData;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data.deposit) {
    return (
      <section className="proposal-section proposal-payment-section">
        <div className="proposal-section-kicker">Payment</div>
        <h2>Payment options</h2>
        <p>
          Your proposal, agreement and warranty are already in this client package. Payment instructions will become active as soon as the deposit amount is confirmed.
        </p>
        <p><strong>Preferred methods:</strong> Zelle or bank transfer — no processing fee. Online payment is available with a 3.5% processing fee.</p>
      </section>
    );
  }

  const paid = data.deposit.status === "paid";

  async function selectMethod(method: string) {
    if (paid) return;
    setSaving(method);
    setError(null);
    try {
      const response = await fetch(`/api/public/proposals/${accessToken}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Unable to select payment method.");
      }
      setData(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to select payment method.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="proposal-section proposal-payment-section">
      <div className="proposal-section-kicker">Payment</div>
      <h2>{paid ? "Deposit received" : "Choose payment method"}</h2>
      <p>
        Deposit amount: <strong>{formatMoney(data.deposit.base_amount, data.currency)}</strong>. Zelle and bank transfer have no processing fee. Online payment includes a 3.5% processing fee.
      </p>

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
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <strong>{option.label}</strong>
                  <div style={{ opacity: 0.72, marginTop: 4 }}>{option.description}</div>
                </div>
                <strong>{formatMoney(option.payable_amount, data.currency)}</strong>
              </div>

              {option.processing_fee > 0 ? (
                <div style={{ marginTop: 8 }}>
                  Processing fee {option.fee_percent}%: {formatMoney(option.processing_fee, data.currency)}
                </div>
              ) : null}

              {selected && option.instructions ? (
                <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{option.instructions}</div>
              ) : null}

              {selected && option.method === "payment_system" && option.payment_link ? (
                <a href={option.payment_link} style={{ display: "inline-block", marginTop: 12 }}>
                  Continue to secure payment
                </a>
              ) : null}

              {selected && option.method === "payment_system" && !option.payment_link ? (
                <div style={{ marginTop: 12, opacity: 0.72 }}>
                  ROLANPRO will provide the secure processor link. The 3.5% fee shown above is the amount that will be added to this payment.
                </div>
              ) : null}

              {!paid ? (
                <button
                  type="button"
                  onClick={() => selectMethod(option.method)}
                  disabled={saving !== null}
                  style={{ marginTop: 14 }}
                >
                  {saving === option.method ? "Saving…" : selected ? "Selected" : `Choose ${option.label}`}
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
