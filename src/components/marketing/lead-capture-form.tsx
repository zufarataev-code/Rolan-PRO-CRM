"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import styles from "@/components/marketing/landing.module.css";

const phoneHref = "tel:+14243250512";
const phoneLabel = "+1 (424) 325-0512";

export type LeadCaptureFormCopy = {
  kicker: string;
  title: string;
  intro: string;
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  propertyTypeLabel: string;
  propertyTypeOptions: ReadonlyArray<{ value: string; label: string }>;
  serviceTypeLabel: string;
  serviceTypeOptions: ReadonlyArray<{ value: string; label: string }>;
  emailLabel: string;
  emailPlaceholder: string;
  cityLabel: string;
  cityPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  buttonLabel: string;
  buttonPendingLabel: string;
  helperCall: string;
  successMessage: string;
  errorMessage: string;
  networkErrorMessage: string;
  honeypotMessage: string;
  consentNote: string;
  smsConsentLabel: string;
  privacyPolicyLabel: string;
  termsLabel: string;
  companyLabel: string;
};

type LeadCaptureFormProps = {
  id?: string;
  compact?: boolean;
  copy: LeadCaptureFormCopy;
  serviceTypeValue?: string;
  onServiceTypeChange?: (value: string) => void;
};

type SubmitState =
  | { kind: "idle"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function LeadCaptureForm({
  id,
  compact = false,
  copy,
  serviceTypeValue,
  onServiceTypeChange,
}: LeadCaptureFormProps) {
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle", message: "" });
  const [isPending, startTransition] = useTransition();

  async function submitLead(
    form: HTMLFormElement,
    payload: {
      name: string;
      phone: string;
      email: string;
      propertyType: string;
      serviceType: string;
      city: string;
      message: string;
      smsConsent: boolean;
    },
  ) {
    try {
      const response = await fetch("/api/public/site-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as
        | { errors?: Array<{ message?: string }> }
        | null;

      if (!response.ok) {
        setSubmitState({
          kind: "error",
          message: result?.errors?.[0]?.message ?? copy.errorMessage,
        });
        return;
      }

      form.reset();
      setSubmitState({
        kind: "success",
        message: copy.successMessage,
      });
    } catch {
      setSubmitState({
        kind: "error",
        message: copy.networkErrorMessage,
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (String(formData.get("company") ?? "").trim()) {
      setSubmitState({
        kind: "success",
        message: copy.honeypotMessage,
      });
      form.reset();
      return;
    }

    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      propertyType: String(formData.get("propertyType") ?? "").trim(),
      serviceType: String(formData.get("serviceType") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      message: String(formData.get("message") ?? "").trim(),
      smsConsent: formData.get("smsConsent") === "on",
    };

    setSubmitState({ kind: "idle", message: "" });

    startTransition(() => {
      void submitLead(form, payload);
    });
  }

  return (
    <form
      id={id}
      className={`${styles.leadForm} ${compact ? styles.leadFormCompact : ""}`.trim()}
      onSubmit={handleSubmit}
    >
      <div className={styles.leadHeader}>
        <div className={styles.formKicker}>{copy.kicker}</div>
        <h3>{copy.title}</h3>
        <p>{copy.intro}</p>
      </div>

      <div className={styles.visuallyHidden} aria-hidden="true">
        <label htmlFor="company">{copy.companyLabel}</label>
        <input id="company" name="company" autoComplete="off" tabIndex={-1} />
      </div>

      <div className={styles.leadGrid}>
        <div className={styles.leadField}>
          <label htmlFor="name">{copy.nameLabel}</label>
          <input
            className={styles.leadInput}
            id="name"
            name="name"
            autoComplete="name"
            required
            placeholder={copy.namePlaceholder}
          />
        </div>

        <div className={styles.leadField}>
          <label htmlFor="phone">{copy.phoneLabel}</label>
          <input
            className={styles.leadInput}
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder={copy.phonePlaceholder}
          />
        </div>

        <div className={styles.leadField}>
          <label htmlFor="propertyType">{copy.propertyTypeLabel}</label>
          <select
            className={styles.leadSelect}
            id="propertyType"
            name="propertyType"
            defaultValue={copy.propertyTypeOptions[0]?.value ?? ""}
          >
            {copy.propertyTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.leadField}>
          <label htmlFor="serviceType">{copy.serviceTypeLabel}</label>
          <select
            className={styles.leadSelect}
            id="serviceType"
            name="serviceType"
            defaultValue={serviceTypeValue ? undefined : copy.serviceTypeOptions[0]?.value ?? ""}
            value={serviceTypeValue}
            onChange={(event) => onServiceTypeChange?.(event.target.value)}
          >
            {copy.serviceTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!compact ? (
          <>
            <div className={styles.leadField}>
              <label htmlFor="email">{copy.emailLabel}</label>
              <input
                className={styles.leadInput}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
              />
            </div>

            <div className={styles.leadField}>
              <label htmlFor="city">{copy.cityLabel}</label>
              <input
                className={styles.leadInput}
                id="city"
                name="city"
                autoComplete="address-level2"
                placeholder={copy.cityPlaceholder}
              />
            </div>

            <div className={styles.leadFieldFull}>
              <label htmlFor="message">{copy.messageLabel}</label>
              <textarea
                className={styles.leadTextarea}
                id="message"
                name="message"
                placeholder={copy.messagePlaceholder}
              />
            </div>
          </>
        ) : null}
      </div>

      <label className={styles.smsConsentBox}>
        <input name="smsConsent" type="checkbox" />
        <span>{copy.smsConsentLabel}</span>
      </label>

      <div className={styles.submitRow}>
        <button className={styles.primaryButton} disabled={isPending} type="submit">
          {isPending ? copy.buttonPendingLabel : copy.buttonLabel}
        </button>
      </div>

      <a className={styles.helperCall} href={phoneHref}>
        {copy.helperCall} {phoneLabel}
      </a>

      {submitState.kind !== "idle" ? (
        <div
          className={`${styles.statusMessage} ${
            submitState.kind === "success" ? styles.statusSuccess : styles.statusError
          }`}
        >
          {submitState.message}
        </div>
      ) : null}

      <p className={styles.formNote}>
        {copy.consentNote}{" "}
        <Link href="/privacy-policy">{copy.privacyPolicyLabel}</Link>{" "}
        <Link href="/terms">{copy.termsLabel}</Link>
      </p>
    </form>
  );
}
