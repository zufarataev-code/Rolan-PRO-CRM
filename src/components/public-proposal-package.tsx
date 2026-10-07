"use client";

import { useState } from "react";

import { ClientProposalView } from "@/components/client-proposal-view";
import { PublicPaymentOptions } from "@/components/public-payment-options";

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
  const depositAmount = Number(paymentOptions?.deposit?.base_amount ?? paymentOptions?.suggested_base_amount ?? 0) || 0;

  const languageSwitch = (
    <div className="rp-lang" role="group" aria-label="Proposal language">
      <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button>
      <button type="button" onClick={() => setLanguage("ru")} aria-pressed={language === "ru"}>RU</button>
    </div>
  );

  return (
    <ClientProposalView
      key={language}
      initialProposal={proposal}
      language={language}
      languageSwitch={languageSwitch}
      depositAmount={depositAmount}
      onAgreementSigned={() => setPaymentRefreshKey((value) => value + 1)}
      paymentSlot={
        <PublicPaymentOptions
          accessToken={accessToken}
          initialData={paymentOptions}
          language={language}
          refreshKey={paymentRefreshKey}
        />
      }
    />
  );
}
