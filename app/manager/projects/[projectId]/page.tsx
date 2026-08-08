import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ProjectExecutionAssignment } from "@/components/project-execution-assignment";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { getProjectCardByIdForSession, getProjectExecutionOptions } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";
import { isSensitiveFinancialFieldKey } from "@/lib/finance/visibility";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString("ru-RU") : "—";
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "—";
}

function formatTime(value: Date | null) {
  return value ? value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function renderDynamicValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

export default async function ProjectCardPage({ params }: PageProps) {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);

  if (!session) {
    redirect("/");
  }

  const canViewInternalFinance = session.roles.includes(ROLE_CODES.OWNER);

  const { projectId } = await params;
  const [project, executionOptions] = await Promise.all([
    getProjectCardByIdForSession(session, projectId),
    getProjectExecutionOptions(),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <ManagerShell
      title="Карточка проекта"
      subtitle="Исполнители, состав работ, расписание, файлы, документы и история проекта."
      kicker="Работа / Проект"
      activeHref="/manager/projects"
      actions={
        <>
          {project.deal?.deal_id ? (
            <Link href={`/manager/crm/calculator?deal_id=${project.deal.deal_id}`} className="soft-button">
              Открыть расчет
            </Link>
          ) : null}
          {project.proposal?.proposal_id ? (
            <Link href={`/manager/crm/proposals/${project.proposal.proposal_id}`} className="soft-button">
              Открыть КП
            </Link>
          ) : null}
          <Link href="/manager/projects" className="soft-button">
            Назад к проектам
          </Link>
          <div className={`chip${project.problem_flag ? " chip-danger" : " chip-accent"}`}>
            {project.problem_flag ? "Problem flag" : project.priority}
          </div>
        </>
      }
    >
      <section className="detail-grid">
        <div className="detail-band">
          <section className="surface">
            <div className="detail-hero">
              <div>
                <div className="page-kicker mono">{project.project_code ?? project.project_id}</div>
                <h2 className="detail-heading">{project.title}</h2>
                <div className="detail-meta">
                  <span>{project.client?.name ?? "Без клиента"}</span>
                  <span>{project.city?.name_ru ?? "Без города"}</span>
                  <span>{project.address ?? "Адрес не указан"}</span>
                </div>
              </div>

              <div className="project-inline-chips">
                <span className="chip">{project.project_status.name_ru}</span>
                {project.payment_status ? <span className="chip">{project.payment_status.name_ru}</span> : null}
                <span className="chip chip-accent">{formatDate(project.install_date)}</span>
              </div>
            </div>
          </section>

          <section className="split-grid">
            <section className="surface">
              <h3 className="surface-title">Overview</h3>
              <div className="inspector-list">
                <div className="inspector-item">
                  <div className="row-title">Header Summary</div>
                  <div className="row-meta">
                    Install window: {formatDate(project.install_date)} • {formatTime(project.start_time)} -{" "}
                    {formatTime(project.end_time)}
                  </div>
                  <div className="row-meta">
                    Client phone: {project.client?.phone ?? "—"} • Zip: {project.zip_code ?? "—"}
                  </div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Manager notes</div>
                  <div className="row-meta">{project.manager_notes ?? "Нет manager notes"}</div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Installer notes</div>
                  <div className="row-meta">{project.installer_notes ?? "Нет installer notes"}</div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">What to bring</div>
                  <div className="row-meta">{project.what_to_bring ?? "Не указано"}</div>
                </div>
                {project.deal ? (
                  <div className="inspector-item">
                    <div className="row-title">Связь с sales chain</div>
                    <div className="row-meta">
                      {project.deal.deal_code} •{" "}
                      {project.proposal
                        ? `КП ${project.proposal.proposal_code ?? project.proposal.proposal_id}`
                        : "КП не найдено"}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="surface">
              <h3 className="surface-title">Crew Assignment</h3>
              <p className="surface-subtitle">
                Lead installer берется из проекта, helpers и assigned installers собираются из installer jobs.
              </p>
              <div className="inspector-list">
                <div className="inspector-item">
                  <div className="row-title">Lead installer</div>
                  <div className="row-meta">{project.crew_assignment.lead_installer?.full_name ?? "Не назначен"}</div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Helpers</div>
                  <div className="row-meta">
                    {project.crew_assignment.helpers.length
                      ? project.crew_assignment.helpers.map((helper) => helper.full_name).join(", ")
                      : "Helpers не назначены"}
                  </div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Crew / active jobs</div>
                  <div className="row-meta">
                    {project.crew_assignment.crew_labels.join(", ") || "Crew TBD"} • {project.crew_assignment.active_jobs}{" "}
                    active jobs
                  </div>
                </div>
              </div>
            </section>
          </section>

          <ProjectExecutionAssignment
            projectId={project.project_id}
            projectStatusLabel={project.project_status.name_ru}
            initialSchedule={
              project.schedule[0]
                ? {
                    date: project.schedule[0].date,
                    start_time: project.schedule[0].start_time,
                    end_time: project.schedule[0].end_time,
                    crew_id: project.schedule[0].crew.crew_id,
                  }
                : null
            }
            initialManagerNotes={project.manager_notes}
            crews={executionOptions.crews}
            installers={executionOptions.installers}
            positions={project.positions.map((position) => ({
              position_id: position.position_id,
              title: position.title ?? position.service_type.name_ru,
              assigned_installer_id: position.assigned_installers[0]?.user_id ?? null,
            }))}
          />

          <section className="surface">
            <h3 className="surface-title">Positions</h3>
            <p className="surface-subtitle">
              Каждая позиция — отдельная service card внутри проекта. Сюда уже перенесены service type, film, addons,
              assigned installers и line economics.
            </p>

            {project.positions.length === 0 ? (
              <div className="empty-state">В проекте пока нет позиций.</div>
            ) : (
              <div className="project-position-stack">
                {project.positions.map((position) => (
                  <article key={position.position_id} className="project-position-card">
                    <div className="project-position-header">
                      <div>
                        <div className="row-title">{position.title ?? position.service_type.name_ru}</div>
                        <div className="row-meta">
                          {position.service_type.name_ru}
                          {position.film
                            ? ` • ${position.film.category_name_ru} / ${position.film.brand_name_ru} / ${position.film.model_name_ru}`
                            : ""}
                        </div>
                      </div>
                      <div className="project-inline-chips">
                        <span className="chip">{position.position_status.name_ru}</span>
                        {position.complexity_level ? (
                          <span className="chip chip-accent">
                            {position.complexity_level.name_ru} x{position.complexity_level.multiplier.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="project-position-grid">
                      <div className="project-subpanel">
                        <div className="project-subpanel-title">Project position logic</div>
                        <div className="inspector-list">
                          <div className="inspector-item">
                            <div className="row-title">Service / pricing</div>
                            <div className="row-meta">
                              {canViewInternalFinance ? (
                                <>
                                  source: {position.pricing_source} • base {formatMoney(position.base_price)} • min{" "}
                                  {formatMoney(position.min_price)} • actual {formatMoney(position.actual_price)}
                                </>
                              ) : (
                                <>Цена клиента: {formatMoney(position.actual_price)}</>
                              )}
                            </div>
                          </div>
                          <div className="inspector-item">
                            <div className="row-title">Dynamic fields</div>
                            <div className="project-key-value-list">
                              {Object.entries(position.dynamic_fields)
                                .filter(([key]) => canViewInternalFinance || !isSensitiveFinancialFieldKey(key))
                                .map(([key, value]) => (
                                  <div key={key} className="project-key-value">
                                    <span>{key}</span>
                                    <strong>{renderDynamicValue(value)}</strong>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="inspector-item">
                            <div className="row-title">Assigned installers</div>
                            <div className="row-meta">
                              {position.assigned_installers.length
                                ? position.assigned_installers
                                    .map((installer) => `${installer.full_name} (${installer.status})`)
                                    .join(", ")
                                : "Installer jobs пока не созданы"}
                            </div>
                          </div>
                          <div className="inspector-item">
                            <div className="row-title">Notes</div>
                            <div className="row-meta">{position.notes ?? "Без notes"}</div>
                          </div>
                        </div>
                      </div>

                      <div className="project-subpanel">
                        <div className="project-subpanel-title">Addons pricing logic</div>
                        {position.addons.length ? (
                          <div className="list-stack">
                            {position.addons.map((addon) => (
                              <div key={addon.position_addon_id} className="list-row">
                                <div className="chip chip-accent">{addon.quantity}</div>
                                <div>
                                  <div className="row-title">{addon.name_ru}</div>
                                  <div className="row-meta">
                                    {formatMoney(addon.unit_price)} / total {formatMoney(addon.total_price)}
                                  </div>
                                </div>
                                <span className="row-meta">addon</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">Допуслуги не выбраны.</div>
                        )}
                      </div>

                      {canViewInternalFinance ? (
                        <div className="project-subpanel">
                          <div className="project-subpanel-title">Finance Snapshot</div>
                          <div className="project-finance-grid">
                            <div className="calculator-metric-card">
                              <span>Выручка строки</span>
                              <strong>{formatMoney(position.finance.revenue_subtotal)}</strong>
                            </div>
                            <div className="calculator-metric-card">
                              <span>Себестоимость</span>
                              <strong>{formatMoney(position.finance.estimated_cost)}</strong>
                            </div>
                            <div className="calculator-metric-card">
                              <span>Прибыль</span>
                              <strong>{formatMoney(position.finance.estimated_profit)}</strong>
                            </div>
                            <div className="calculator-metric-card">
                              <span>Маржа</span>
                              <strong>{position.finance.estimated_margin_percent.toFixed(1)}%</strong>
                            </div>
                          </div>
                          {position.finance.warnings.length ? (
                            <div className="project-warning-list">
                              {position.finance.warnings.map((warning) => (
                                <div key={warning} className="project-warning">
                                  {warning}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="project-subpanel">
                          <div className="project-subpanel-title">Цена клиента</div>
                          <div className="calculator-metric-card">
                            <span>Сумма строки</span>
                            <strong>{formatMoney(position.finance.revenue_subtotal)}</strong>
                          </div>
                          <div className="row-meta" style={{ marginTop: 12 }}>
                            Себестоимость, переменные расходы и прибыль доступны только владельцу.
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="surface">
            <h3 className="surface-title">Project Schedule</h3>
            <p className="surface-subtitle">
              Schedule block теперь строится из normalized schedule assignments и installer jobs по проекту.
            </p>

            {project.schedule.length === 0 ? (
              <div className="empty-state">Schedule assignment по проекту пока не создан.</div>
            ) : (
              <div className="list-stack">
                {project.schedule.map((event) => (
                  <div key={event.schedule_assignment_id} className="list-row">
                    <div className="chip chip-accent">Install</div>
                    <div>
                      <div className="row-title">{event.crew.name}</div>
                      <div className="row-meta">
                        {formatDate(event.date)} • {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </div>
                      <div className="row-meta">
                        {event.installers.length
                          ? event.installers.map((installer) => installer.full_name).join(", ")
                          : "Installers не назначены"}
                      </div>
                    </div>
                    <span className="chip">scheduled</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="split-grid">
            <section className="surface">
              <h3 className="surface-title">Files</h3>
              <p className="surface-subtitle">Полевые файлы, фото монтажа и project-linked uploads.</p>
              {project.files.length ? (
                <div className="list-stack">
                  {project.files.map((file) => (
                    <div key={file.file_id} className="list-row">
                      <div className="chip chip-accent">{file.file_type}</div>
                      <div>
                        <div className="row-title">
                          <a href={file.file_url} target="_blank" rel="noreferrer">
                            {file.original_name}
                          </a>
                        </div>
                        <div className="row-meta">
                          {file.uploaded_by} • {file.position_title ?? "project-level file"}
                        </div>
                        <div className="row-meta mono">{file.file_url}</div>
                      </div>
                      <span className="row-meta">{formatDateTime(file.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Файлы по проекту пока не загружены.</div>
              )}
            </section>

            <section className="surface">
              <h3 className="surface-title">Documents</h3>
              <p className="surface-subtitle">Контракты, proposal PDFs, signed forms и прочие клиентские документы.</p>
              {project.documents.length ? (
                <div className="list-stack">
                  {project.documents.map((document) => (
                    <div key={document.document_id} className="list-row">
                      <div className="chip">{document.document_type}</div>
                      <div>
                        <div className="row-title">
                          {document.file_url ? (
                            <a href={document.file_url} target="_blank" rel="noreferrer">
                              {document.title}
                            </a>
                          ) : (
                            document.title
                          )}
                        </div>
                        <div className="row-meta">
                          {document.status} • {document.language_code.toUpperCase()} • {document.created_by}
                        </div>
                        {document.file_url ? <div className="row-meta mono">{document.file_url}</div> : null}
                      </div>
                      <span className="row-meta">{formatDateTime(document.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Документы по проекту пока не загружены.</div>
              )}
            </section>
          </section>
        </div>

        <div className="detail-band">
          <section className="surface">
            <h3 className="surface-title">{canViewInternalFinance ? "Finance Snapshot" : "Продажа и оплата"}</h3>
            <p className="surface-subtitle">
              {canViewInternalFinance
                ? "Owner-only preview по выручке, себестоимости, прибыли и марже проекта."
                : "Менеджеру доступны клиентская сумма и статус оплаты. Внутренние расходы скрыты."}
            </p>
            <div className="project-finance-grid">
              <div className="calculator-metric-card">
                <span>Proposal Total</span>
                <strong>{formatMoney(project.finance_snapshot.proposal_total)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Revenue</span>
                <strong>{formatMoney(project.finance_snapshot.revenue_total)}</strong>
              </div>
              {canViewInternalFinance ? (
                <>
                  <div className="calculator-metric-card">
                    <span>Estimated Cost</span>
                    <strong>{formatMoney(project.finance_snapshot.estimated_cost_total)}</strong>
                  </div>
                  <div className="calculator-metric-card">
                    <span>Estimated Profit</span>
                    <strong>{formatMoney(project.finance_snapshot.estimated_profit_total)}</strong>
                  </div>
                  <div className="calculator-metric-card">
                    <span>Margin</span>
                    <strong>{project.finance_snapshot.estimated_margin_percent.toFixed(1)}%</strong>
                  </div>
                  <div className="calculator-metric-card">
                    <span>Below minimum</span>
                    <strong>{project.finance_snapshot.below_minimum_positions}</strong>
                  </div>
                </>
              ) : (
                <div className="calculator-metric-card">
                  <span>Статус оплаты</span>
                  <strong>{project.payment_status?.name_ru ?? "Не указан"}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Activity Log</h3>
            {project.activity.length ? (
              <div className="list-stack">
                {project.activity.map((activity) => (
                  <div key={activity.activity_id} className="list-row">
                    <div className="chip chip-accent">{activity.action_key}</div>
                    <div>
                      <div className="row-title">{activity.message}</div>
                      <div className="row-meta">{activity.actor}</div>
                    </div>
                    <span className="row-meta">{formatDateTime(activity.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Activity log пока пуст.</div>
            )}
          </section>

          <section className="surface">
            <h3 className="surface-title">Email Actions</h3>
            {project.email_actions.length ? (
              <div className="inspector-list">
                {project.email_actions.map((email) => (
                  <div key={email.email_action_id} className="inspector-item">
                    <div className="row-title">{email.subject}</div>
                    <div className="row-meta">{email.recipient_email}</div>
                    <div className="row-meta">
                      {email.status} • {email.created_by} • {formatDateTime(email.sent_at ?? email.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Email actions по проекту пока нет.</div>
            )}
          </section>

          <section className="surface">
            <h3 className="surface-title">Notifications</h3>
            {project.notifications.length ? (
              <div className="inspector-list">
                {project.notifications.map((notification) => (
                  <div key={notification.notification_id} className="inspector-item">
                    <div className="row-title">{notification.title}</div>
                    <div className="row-meta">{notification.message}</div>
                    <div className="row-meta">
                      {notification.actor} → {notification.recipient} • {notification.is_read ? "read" : "new"} •{" "}
                      {formatDateTime(notification.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Project notifications пока нет.</div>
            )}
          </section>
        </div>
      </section>
    </ManagerShell>
  );
}
