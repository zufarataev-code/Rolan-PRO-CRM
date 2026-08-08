import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConsultationSurveyWorkspace } from "@/components/consultation-survey-workspace";
import { ManagerShell } from "@/components/manager-shell";
import { getServiceCalculatorBootstrap } from "@/features/calculator/bootstrap";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { getConsultationByIdForSession } from "@/features/consultations/service";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{
    consultationId: string;
  }>;
};

export default async function ManagerConsultationCardPage({ params }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

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

  const linkedDealId = consultation.deal?.deal_id ?? null;

  return (
    <ManagerShell
      title="Карточка замера"
      subtitle="Внесите размеры клиента — данные сразу станут доступны в расчете и коммерческом предложении."
      kicker="Клиенты / Замер"
      activeHref="/manager/crm/consultations"
      actions={
        <>
          <Link href="/manager/crm/consultations" className="soft-button">
            Назад к консультациям
          </Link>
          {linkedDealId ? (
            <Link href={`/manager/crm/deals/${linkedDealId}`} className="soft-button">
              К сделке
            </Link>
          ) : null}
          {linkedDealId ? (
            <Link href={`/manager/crm/calculator?deal_id=${linkedDealId}`} className="accent-button">
              Открыть калькулятор
            </Link>
          ) : null}
          <div className="chip chip-accent">{consultation.survey?.status ?? "draft"}</div>
        </>
      }
    >
      <section className="detail-grid">
        <div id="workspace">
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
        </div>

        <div className="detail-band">
          <section className="surface">
            <div className="detail-hero">
              <div>
                <div className="page-kicker mono">{consultation.deal?.deal_code ?? consultation.lead?.lead_code ?? "CONSULTATION"}</div>
                <h2 className="detail-heading">{consultation.title}</h2>
                <div className="detail-meta">
                  <span>{consultation.client?.name ?? consultation.lead?.name ?? "Без клиента"}</span>
                  <span>{consultation.assigned_consultant.full_name}</span>
                  <span className="mono">{consultation.scheduled_start_at.toLocaleString("ru-RU")}</span>
                </div>
              </div>
              <div className="chip">{consultation.status}</div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Как это использовать менеджеру</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">1. Клиент прислал размеры</div>
                <div className="row-meta">Менеджер открывает этот screen и сам заносит комнаты, окна, стекло, сторону, размеры и фото.</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">2. Survey становится основой расчета</div>
                <div className="row-meta">После заполнения размеры не теряются: они остаются внутри consultation / survey и дальше идут в calculator и proposal.</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">3. Deal остается центром</div>
                <div className="row-meta">Вернитесь в сделку и продолжайте путь: survey → calculator → proposal → deposit → project.</div>
              </div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Survey snapshot</h3>
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

          <section className="surface">
            <h3 className="surface-title">Manager / consultant notes</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">Manager notes</div>
                <div className="row-meta">{consultation.manager_notes ?? "Нет manager notes"}</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Consultant notes</div>
                <div className="row-meta">{consultation.consultant_notes ?? "Нет consultant notes"}</div>
              </div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Survey photo uploads</h3>
            {consultation.survey?.photos.length ? (
              <div className="inspector-list">
                {consultation.survey.photos.map((photo) => (
                  <div key={photo.file_id} className="inspector-item">
                    <div className="row-title">{photo.original_name}</div>
                    <div className="row-meta">{photo.file_type}</div>
                    <div className="row-meta mono">{photo.file_url}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Фото по survey пока нет.</div>
            )}
          </section>
        </div>
      </section>
    </ManagerShell>
  );
}
