"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type SubmitState =
  | { kind: "idle"; message: "" }
  | { kind: "success" | "error"; message: string };

export function SmsConsentForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setSubmitting(true);
    setState({ kind: "idle", message: "" });

    try {
      const response = await fetch("/api/public/site-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          phone: String(data.get("phone") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          message: String(data.get("message") ?? "").trim(),
          smsConsent: data.get("smsConsent") === "on",
          consentSource: "sms_consent_page",
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { errors?: Array<{ message?: string }> }
        | null;

      if (!response.ok) {
        setState({
          kind: "error",
          message: result?.errors?.[0]?.message ?? "We could not save your request. Please try again.",
        });
        return;
      }

      form.reset();
      setState({
        kind: "success",
        message: "Thank you. Your SMS consent and service request have been recorded.",
      });
    } catch {
      setState({ kind: "error", message: "We could not save your request. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sms-optin-form" onSubmit={handleSubmit}>
      <div className="sms-optin-grid">
        <label>
          Full name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Mobile phone
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
        </label>
        <label className="sms-optin-full">
          Email (optional)
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label className="sms-optin-full">
          How can we help? (optional)
          <textarea name="message" rows={4} />
        </label>
      </div>

      <label className="sms-optin-consent">
        <input name="smsConsent" type="checkbox" required />
        <span>
          I agree to receive customer-care and transactional SMS messages from RolanPRO about my quote,
          consultation, measurement appointment, installation schedule, project updates, payment balance,
          and support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or
          HELP for help. Consent is not a condition of purchase.
        </span>
      </label>

      <p className="sms-optin-disclosure">
        RolanPRO does not sell or share mobile information or SMS consent with third parties or affiliates
        for marketing or promotional purposes. See our{" "}
        <Link className="legal-inline-link" href="/privacy-policy">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link className="legal-inline-link" href="/terms">
          Terms &amp; SMS Terms
        </Link>
        .
      </p>

      <button className="sms-optin-submit" disabled={submitting} type="submit">
        {submitting ? "Submitting…" : "Submit request and SMS consent"}
      </button>

      {state.kind !== "idle" ? (
        <p className={`sms-optin-status sms-optin-status-${state.kind}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
