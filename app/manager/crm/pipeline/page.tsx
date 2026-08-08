import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { PipelineWorkspace } from "@/components/pipeline-workspace";
import { getPipelineBoardData } from "@/features/sales/server-api";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

export default async function PipelineBoardPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const columns = await getPipelineBoardData();

  return (
    <ManagerShell
      title="Воронка продаж"
      subtitle="Лиды, сроки и следующие действия — в одной управляемой воронке."
      kicker="Отдел продаж"
      activeHref="/manager/crm/pipeline"
      actions={
        <Link href="/manager/crm/leads" className="accent-button">
          Новый лид
        </Link>
      }
    >
      <PipelineWorkspace columns={columns} />
    </ManagerShell>
  );
}
