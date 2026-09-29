"use client";

import { useState } from "react";

import { ClientProposalView } from "@/components/client-proposal-view";
import { PublicPaymentOptions } from "@/components/public-payment-options";
import { PublicWarrantySummary } from "@/components/public-warranty-summary";

type Language = "en" | "ru";

export function PublicProposalPackage({
  proposal,
  paymentOptions,
  accessToken,
  initialLanguage = "en",
}: {
  proposal: any;
  paymentOptions: any;
  accessToken: string;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);

  return (
    <>
      <div
        aria-label="Proposal language"
        style={{
          position: "sticky",
          top: 12,
          zIndex: 30,
          display: "flex",
          justifyContent: "flex-end",
          gap: 6,
          marginBottom: 10,
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", gap: 6, padding: 6, borderRadius: 999, background: "white", boxShadow: "0 8px 30px rgba(15,23,42,.14)", pointerEvents: "auto" }}>
          <button type="button" onClick={() => setLanguage("ru")} aria-pressed={language === "ru"} style={{ borderRadius: 999, padding: "8px 14px", fontWeight: 700, background: language === "ru" ? "#1d4ed8" : "transparent", color: language === "ru" ? "white" : "#0f172a" }}>
            Русский
          </button>
          <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"} style={{ borderRadius: 999, padding: "8px 14px", fontWeight: 700, background: language === "en" ? "#1d4ed8" : "transparent", color: language === "en" ? "white" : "#0f172a" }}>
            English
          </button>
        </div>
      </div>

      <ClientProposalView
        key={language}
        initialProposal={proposal}
        language={language}
        onAgreementSigned={() => setPaymentRefreshKey((value) => value + 1)}
      />
      <PublicWarrantySummary language={language} />
      <PublicPaymentOptions
        accessToken={accessToken}
        initialData={paymentOptions}
        language={language}
        refreshKey={paymentRefreshKey}
      />
    </>
  );
}
