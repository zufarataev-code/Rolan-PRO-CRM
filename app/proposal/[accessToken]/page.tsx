import { notFound } from "next/navigation";

import { PublicProposalPackage } from "@/components/public-proposal-package";
import { getPublicPaymentOptions } from "@/features/payments/public-options";
import { getPublicProposal } from "@/features/proposals/service";

type PageProps = {
  params: Promise<{
    accessToken: string;
  }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function PublicProposalPage({ params, searchParams }: PageProps) {
  const { accessToken } = await params;
  const { lang } = await searchParams;
  const [proposal, paymentOptions] = await Promise.all([
    getPublicProposal(accessToken),
    getPublicPaymentOptions(accessToken),
  ]);

  if (!proposal || !paymentOptions) {
    notFound();
  }

  return (
    <main className="landing-shell proposal-page-shell">
      <PublicProposalPackage
        proposal={{ ...proposal, access_token: accessToken }}
        paymentOptions={paymentOptions}
        accessToken={accessToken}
        initialLanguage={lang === "ru" ? "ru" : "en"}
      />
    </main>
  );
}
