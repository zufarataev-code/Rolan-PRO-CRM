import { redirect } from "next/navigation";

import { ManagerPlanningBoard } from "@/components/manager-planning-board";
import { ManagerShell } from "@/components/manager-shell";
import { getManagerPlanningData, normalizePlanningViewMode } from "@/features/calendar/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

type PageProps = {
  searchParams: Promise<{
    view?: string;
    date?: string;
  }>;
};

export default async function ManagerCalendarPage({ searchParams }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const params = await searchParams;
  const data = await getManagerPlanningData(session, {
    anchorDate: params.date,
    viewMode: normalizePlanningViewMode(params.view),
  });

  return (
    <ManagerShell
      title="Расписание"
      subtitle="Замеры и монтажи по дням, неделям и месяцам: маршруты, карта и загрузка команды."
      kicker="Работа / Расписание"
      activeHref="/manager/calendar"
      actions={
        <>
          <div className="chip chip-accent">{data.metrics.total} событий</div>
          <div className="chip">{data.metrics.installations} монтажей</div>
          <div className="chip">{data.metrics.consultations} консультаций</div>
        </>
      }
    >
      <ManagerPlanningBoard data={data} />
    </ManagerShell>
  );
}
