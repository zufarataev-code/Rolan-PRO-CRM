import { notFound } from "next/navigation";

import { ClientProposalView } from "@/components/client-proposal-view";
import { PublicPaymentOptions } from "@/components/public-payment-options";
import { PublicWarrantySummary } from "@/components/public-warranty-summary";
import { getPublicPaymentOptions } from "@/features/payments/public-options";
import { getPublicProposal } from "@/features/proposals/service";

type PageProps = {
  params: Promise<{
    accessToken: string;
  }>;
};

export default async function PublicProposalPage({ params }: PageProps) {
  const { accessToken } = await params;
  const [proposal, paymentOptions] = await Promise.all([
    getPublicProposal(accessToken),
    getPublicPaymentOptions(accessToken),
  ]);

  if (!proposal || !paymentOptions) {
    notFound();
  }

  return (
    <main className="landing-shell proposal-page-shell">
      <ClientProposalView initialProposal={{ ...proposal, access_token: accessToken }} />
      <PublicWarrantySummary />
      <PublicPaymentOptions accessToken={accessToken} initialData={paymentOptions} />
    </main>
  );
}
