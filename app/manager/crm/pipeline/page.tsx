import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { PipelineWorkspace } from "@/components/pipeline-workspace";
import { SALES_PIPELINE_STAGE_CODES } from "@/features/sales/pipeline";
import { getPipelineBoardData } from "@/features/sales/server-api";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

const SALES_STAGE_SET = new Set<string>(SALES_PIPELINE_STAGE_CODES);

export default async function PipelineBoardPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const allColumns = await getPipelineBoardData();
  const columns = allColumns.filter((column: { status_code: string }) => SALES_STAGE_SET.has(column.status_code));

  return (
    <ManagerShell
      title="Воронка продаж"
      subtitle="Лид → замер → КП → договор → аванс → результат. После закрытия продажи начинается отдельный проект."
      kicker="Отдел продаж"
      activeHref="/manager/crm/pipeline"
      actions={
        <>
          <Link href="/manager/crm/leads" className="accent-button">
            Новый лид
          </Link>
          <Link href="/manager/crm/calculator" className="soft-button">
            Быстрый калькулятор
          </Link>
        </>
      }
    >
      <PipelineWorkspace columns={columns} />
    </ManagerShell>
  );
}
