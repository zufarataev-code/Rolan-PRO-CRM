import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConsultantShell } from "@/components/consultant-shell";
import { ConsultationSurveyWorkspace } from "@/components/consultation-survey-workspace";
import { getServiceCalculatorBootstrap } from "@/features/calculator/bootstrap";
import { getConsultationByIdForSession } from "@/features/consultations/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{
    consultationId: string;
  }>;
};

export default async function ConsultationSurveyPage({ params }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT]);

  if (!session) {
    redirect("/");
  }

  const { consultationId } = await params;
  const [consultation, calculatorBootstrap, complexityLevels] = await Promise.all([
    getConsultationByIdForSession(session, consultationId),
    getServiceCalculatorBootstrap(),
    prisma.complexityLevel.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        sort_order: "asc",
      },
      select: {
        complexity_level_id: true,
        name_ru: true,
      },
    }),
  ]);

  if (!consultation) {
    notFound();
  }

  return (
    <ConsultantShell
      title="Карточка замера"
      subtitle="Размеры, рекомендации по пленке, фотографии и данные клиента в одном экране."
      kicker="Выезды / Замер"
      activeHref="/survey"
      actions={
        <>
          <Link href="/survey" className="soft-button">
            Назад к списку
          </Link>
          <div className="chip chip-accent">{consultation.status}</div>
        </>
      }
    >
      <section className="detail-grid">
        <ConsultationSurveyWorkspace
          consultation={consultation}
          referenceData={{
            complexity_levels: complexityLevels,
            service_types: calculatorBootstrap.service_types.map((serviceType) => ({
              service_type_id: serviceType.service_type_id,
              name_ru: serviceType.name_ru,
            })),
            film_catalog: calculatorBootstrap.film_catalog.map((film) => ({
              film_id: film.film_id,
              label: `${film.category_name_ru} / ${film.brand_name_ru} / ${film.model_name_ru}`,
            })),
          }}
        />

        <div className="detail-band">
          <section className="surface">
            <h3 className="surface-title">Контекст клиента</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{consultation.client?.name ?? "Без клиента"}</div>
                <div className="row-meta mono">
                  {consultation.client?.phone ?? consultation.lead?.phone ?? "нет телефона"}
                </div>
                <div className="row-meta">
                  {consultation.client?.email ?? consultation.lead?.email ?? "нет email"}
                </div>
              </div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Notes менеджера</h3>
            <div className="inspector-item">
              <div className="row-meta">{consultation.manager_notes ?? "Менеджерские notes пока не добавлены."}</div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Notes консультанта</h3>
            <div className="inspector-item">
              <div className="row-meta">{consultation.consultant_notes ?? "Consultant notes пока не добавлены."}</div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Current survey snapshot</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{consultation.survey?.measurements.length ?? 0} measurements</div>
                <div className="row-meta">{consultation.survey?.recommendations.length ?? 0} recommendations</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">{consultation.survey?.photos.length ?? 0} photos</div>
                <div className="row-meta">{consultation.survey?.status ?? "draft"}</div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </ConsultantShell>
  );
}
