import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ProposalBuilder } from "@/components/proposal-builder";
import {
  getServiceCalculatorBootstrap,
  withoutInternalCalculatorCosts,
} from "@/features/calculator/bootstrap";
import { getProposalById } from "@/features/proposals/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

type PageProps = {
  params: Promise<{
    proposalId: string;
  }>;
};

export default async function ProposalDetailPage({ params }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { proposalId } = await params;
  const [proposal, internalCalculatorBootstrap] = await Promise.all([
    getProposalById(session, proposalId),
    getServiceCalculatorBootstrap(),
  ]);
  const calculatorBootstrap = session.roles.includes(ROLE_CODES.OWNER)
    ? internalCalculatorBootstrap
    : withoutInternalCalculatorCosts(internalCalculatorBootstrap);

  if (!proposal) {
    redirect("/manager/crm/proposals");
  }

  return (
    <ManagerShell
      title="Карточка предложения"
      subtitle="Отредактируйте услуги, отправьте ссылку клиенту и следите за согласованием."
      kicker="Продажи / Предложение"
      activeHref="/manager/crm/proposals"
    >
      <ProposalBuilder
        initialProposal={proposal}
        calculatorBootstrap={calculatorBootstrap}
      />
    </ManagerShell>
  );
}
