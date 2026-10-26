import { notFound } from "next/navigation";

import { PublicProposalPackage } from "@/components/public-proposal-package";
import { getPublicPaymentOptions, reconcilePublicStripeCheckout } from "@/features/payments/public-options";
import { getPublicProposal } from "@/features/proposals/service";

type PageProps = {
  params: Promise<{
    accessToken: string;
  }>;
  searchParams: Promise<{ lang?: string; payment?: string; session_id?: string }>;
};

export default async function PublicProposalPage({ params, searchParams }: PageProps) {
  const { accessToken } = await params;
  const { lang, payment, session_id: sessionId } = await searchParams;
  if (payment === "success") {
    await reconcilePublicStripeCheckout(accessToken, sessionId);
  }
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
