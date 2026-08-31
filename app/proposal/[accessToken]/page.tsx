import { notFound } from "next/navigation";

import { ClientProposalView } from "@/components/client-proposal-view";
import { getPublicProposal } from "@/features/proposals/service";

type PageProps = {
  params: Promise<{
    accessToken: string;
  }>;
};

export default async function PublicProposalPage({ params }: PageProps) {
  const { accessToken } = await params;
  const proposal = await getPublicProposal(accessToken);

  if (!proposal) {
    notFound();
  }

  return (
    <main className="landing-shell proposal-page-shell">
      <ClientProposalView initialProposal={{ ...proposal, access_token: accessToken }} />
    </main>
  );
}
