import { redirect } from "next/navigation";

import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { getControlCenterOps, getControlCenterSnapshot } from "@/features/owner/control-center";
import { getAgentBoard, type AgentName, type AgentPr } from "@/features/owner/control-center-agents";
import { money, type OpsCard } from "@/features/owner/control-center-ops";
import {
  GROUP_TITLES,
  PROJECTS,
  sortByUrgency,
  summarizeStatuses,
  type ServiceGroup,
  type ServiceStatus,
} from "@/features/owner/control-center-core";
import { requireAppSession } from "@/lib/auth/app-session";

import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Центр управления — RolanPRO" };

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "Работает",
  warn: "Внимание",
  down: "Сломано",
  unknown: "Нет данных",
};

const PROJECT_STATE: Record<string, string> = { active: "В работе", planned: "В плане", paused: "Отложено" };

const css = `
.cc{--ok:#1f9d6b;--warn:#d9822b;--down:#d64545;--unknown:#8a97a6;--ink:#0f1b2a;--mute:#5d6b7a;--line:#e3e8ee;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:#f5f7fa;min-height:100vh;padding:20px 16px 64px}
.cc-wrap{max-width:1080px;margin:0 auto}
.cc-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:18px}
.cc h1{font-size:26px;margin:0;letter-spacing:-.01em}
.cc-sub{color:var(--mute);font-size:13px;margin-top:4px}
.cc-back{font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:#fff;padding:8px 12px;border-radius:4px}
.cc-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px}
.cc-sum div{background:#fff;border:1px solid var(--line);border-radius:4px;padding:12px;border-top:4px solid var(--c)}
.cc-sum b{display:block;font-size:24px}
.cc-sum span{font-size:12px;color:var(--mute)}
.cc-alert{background:#fff;border:1px solid var(--line);border-left:5px solid var(--down);border-radius:4px;padding:12px 14px;margin-bottom:22px}
.cc-alert h2{font-size:15px;margin:0 0 6px}
.cc-alert li{font-size:13px;margin:4px 0}
.cc-group{margin-bottom:22px}
.cc-group h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);margin:0 0 8px}
.cc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px}
.cc-card{background:#fff;border:1px solid var(--line);border-left:5px solid var(--c);border-radius:4px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.cc-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.cc-name{font-weight:600;font-size:15px}
.cc-pill{font-size:11px;font-weight:600;color:#fff;background:var(--c);padding:3px 8px;border-radius:3px;white-space:nowrap}
.cc-detail{font-size:13px}
.cc-meta{font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:10px}
.cc-meta a{color:var(--ink)}
.cc-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.cc-proj{background:#fff;border:1px solid var(--line);border-radius:4px;padding:12px}
.cc-proj b{display:block;font-size:14px;margin-bottom:4px}
.cc-proj small{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.cc-proj p{font-size:12px;color:var(--mute);margin:4px 0 0}
.cc-money{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px}
.cc-money a,.cc-money div{background:#0f1b2a;color:#fff;border-radius:4px;padding:12px 14px;text-decoration:none;display:block}
.cc-money b{display:block;font-size:22px;letter-spacing:-.01em}
.cc-money span{font-size:12px;opacity:.75}
.cc-money .cc-hot{background:#d64545}
.cc-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,1fr);gap:8px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}
.cc-col{background:#eef2f6;border-radius:4px;padding:8px;scroll-snap-align:start;min-width:0}
.cc-col h3{font-size:12px;margin:2px 4px 8px;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}
.cc-col h3 b{color:var(--ink)}
.cc-pc{display:block;background:#fff;border:1px solid var(--line);border-left:4px solid var(--c,#3b6fd8);border-radius:4px;padding:9px 10px;margin-bottom:6px;color:var(--ink);text-decoration:none}
.cc-pc b{display:block;font-size:13px;overflow-wrap:anywhere}
.cc-pc small{display:block;font-size:12px;color:var(--mute);margin-top:2px;overflow-wrap:anywhere}
.cc-pc em{font-style:normal;font-size:12px;font-weight:600}
.cc-more{font-size:12px;color:var(--mute);margin:2px 4px}
.cc-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cc-list{background:#fff;border:1px solid var(--line);border-radius:4px;padding:6px 12px}
.cc-list a{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:13px}
.cc-list a:last-child{border-bottom:0}
.cc-list p{font-size:13px;color:var(--mute);margin:8px 0}
.cc-agents{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cc-agent{background:#fff;border:1px solid var(--line);border-top:4px solid var(--c);border-radius:4px;padding:10px 12px;min-width:0}
.cc-agent h3{font-size:14px;margin:0 0 6px;display:flex;justify-content:space-between}
.cc-agent a{display:block;font-size:12px;color:var(--ink);text-decoration:none;padding:5px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
.cc-agent a i{font-style:normal;font-size:10px;font-weight:700;color:#fff;padding:1px 5px;border-radius:3px;margin-left:4px}
.cc-note{font-size:12px;color:var(--mute);margin:6px 0 0}
@media(max-width:820px){.cc-money{grid-template-columns:repeat(2,1fr)}.cc-two,.cc-agents{grid-template-columns:1fr}}
@media(max-width:560px){.cc-sum{grid-template-columns:repeat(2,1fr)}.cc h1{font-size:22px}.cc-board{grid-auto-columns:82%}}
`;

const color = (status: ServiceStatus) => ({ "--c": `var(--${status})` }) as React.CSSProperties;

const STAGE_COLOR: Record<string, string> = { lead: "#8a97a6", survey: "#5b6fd8", proposal: "#d9822b", install: "#8b5cf6", closing: "#1f9d6b" };
const AGENT_COLOR: Record<AgentName, string> = { Claude: "#d97757", Codex: "#10a37f", Другие: "#8a97a6" };

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { timeZone: "America/Los_Angeles", day: "numeric", month: "short" }) : "";
const installLabel = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { timeZone: "America/Los_Angeles", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ProjectCard({ card, color: c }: { card: OpsCard; color: string }) {
  return (
    <a className="cc-pc" href={card.link} style={{ "--c": c } as React.CSSProperties}>
      <b>{card.client}</b>
      <small>{card.number ? `№${card.number} · ` : ""}{card.title}</small>
      <small>
        {card.statusRu}
        {card.installAt ? ` · монтаж ${shortDate(card.installAt)}` : ""}
      </small>
      {card.total !== null && (
        <em style={{ color: card.balance ? "var(--down)" : "var(--ok)" }}>
          {money(card.total)}{card.balance ? ` · к оплате ${money(card.balance)}` : " · оплачено"}
        </em>
      )}
    </a>
  );
}

function AgentColumn({ name, prs }: { name: AgentName; prs: AgentPr[] }) {
  const fresh = prs.filter((pr) => !pr.stale);
  return (
    <div className="cc-agent" style={{ "--c": AGENT_COLOR[name] } as React.CSSProperties}>
      <h3>
        <span>{name}</span>
        <span>{fresh.length} в работе{prs.length > fresh.length ? ` · ${prs.length - fresh.length} зависли` : ""}</span>
      </h3>
      {prs.length === 0 && <p className="cc-note">Открытых задач нет</p>}
      {prs.slice(0, 8).map((pr) => (
        <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer" style={{ opacity: pr.stale ? 0.55 : 1 }}>
          #{pr.number} {pr.title}
          {pr.conflictRisk && <i style={{ background: "var(--down)" }}>пересечение</i>}
          {pr.needsOwner && <i style={{ background: "var(--warn)" }}>нужен ты</i>}
          {pr.draft && <i style={{ background: "var(--unknown)" }}>черновик</i>}
        </a>
      ))}
      {prs.length > 8 && <p className="cc-note">и ещё {prs.length - 8}</p>}
    </div>
  );
}

export default async function ControlCenterPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);
  if (!session) redirect("/");

  const [{ checkedAt, services }, opsResult, agents] = await Promise.all([
    getControlCenterSnapshot(),
    getControlCenterOps(),
    getAgentBoard(),
  ]);
  const ops = opsResult.ok ? opsResult.ops : null;
  const { counts } = summarizeStatuses(services.map((service) => service.result.status));
  const problems = sortByUrgency(services).filter((service) => service.result.status === "down" || service.result.status === "warn");
  const groups = Object.keys(GROUP_TITLES) as ServiceGroup[];

  return (
    <main className="cc">
      <style>{css}</style>
      <AutoRefresh />
      <div className="cc-wrap">
        <div className="cc-top">
          <div>
            <h1>Центр управления RolanPRO</h1>
            <div className="cc-sub">
              Проверено {checkedAt.toLocaleTimeString("ru-RU", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" })} (Лос-Анджелес) · обновляется каждую минуту
            </div>
          </div>
          <a className="cc-back" href="/legacy-crm">← В CRM</a>
        </div>

        {ops ? (
          <>
            <div className="cc-money">
              <div>
                <b>{ops.active}</b>
                <span>Проектов в работе</span>
              </div>
              <div>
                <b>{ops.installsNext7.length}</b>
                <span>Монтажей на 7 дней</span>
              </div>
              <div className={ops.receivable > 0 ? "cc-hot" : undefined}>
                <b>{money(ops.receivable)}</b>
                <span>Нам должны · {ops.receivableCount} клиент(ов)</span>
              </div>
              <div>
                <b>{money(ops.received30)}</b>
                <span>Получено за 30 дней</span>
              </div>
            </div>

            <section className="cc-group">
              <h2>Проекты по этапам</h2>
              <div className="cc-board">
                {ops.stages.map((stage) => (
                  <div className="cc-col" key={stage.key}>
                    <h3>
                      <span>{stage.title}</span>
                      <b>{stage.count}</b>
                    </h3>
                    {stage.cards.map((card) => (
                      <ProjectCard key={card.id} card={card} color={STAGE_COLOR[stage.key]} />
                    ))}
                    {stage.count > stage.cards.length && (
                      <p className="cc-more">
                        и ещё {stage.count - stage.cards.length} — <a href="/legacy-crm">все в CRM</a>
                      </p>
                    )}
                    {stage.count === 0 && <p className="cc-more">Пусто</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className="cc-group cc-two">
              <div>
                <h2>Монтажи на неделю</h2>
                <div className="cc-list">
                  {ops.installsNext7.length === 0 && <p>На ближайшие 7 дней монтажей нет</p>}
                  {ops.installsNext7.map((card) => (
                    <a key={card.id} href={card.link}>
                      <span>{card.client} · {card.title}</span>
                      <b>{card.installAt ? installLabel(card.installAt) : ""}</b>
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <h2>Кто должен</h2>
                <div className="cc-list">
                  {ops.debtors.length === 0 && <p>Долгов по принятым КП нет</p>}
                  {ops.debtors.map((card) => (
                    <a key={card.id} href={card.link}>
                      <span>{card.client} · {card.statusRu}</span>
                      <b style={{ color: "var(--down)" }}>{money(card.balance ?? 0)}</b>
                    </a>
                  ))}
                </div>
                {ops.withoutEstimate > 0 && (
                  <p className="cc-note">
                    Ещё {ops.withoutEstimate} принятых проектов без утверждённой сметы — их долг не посчитан. Сумма фиксируется при принятии КП.
                  </p>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="cc-alert">
            <h2>Проекты не загрузились</h2>
            <p className="cc-note">{opsResult.ok ? "" : opsResult.error}. Статусы сервисов ниже работают отдельно.</p>
          </section>
        )}

        <div className="cc-sum">
          {(["ok", "warn", "down", "unknown"] as ServiceStatus[]).map((status) => (
            <div key={status} style={color(status)}>
              <b>{counts[status]}</b>
              <span>{STATUS_LABEL[status]}</span>
            </div>
          ))}
        </div>

        {problems.length > 0 && (
          <section className="cc-alert">
            <h2>Что требует внимания</h2>
            <ul>
              {problems.map((service) => (
                <li key={service.id}>
                  <b>{service.name}:</b> {service.result.detail}
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map((group) => (
          <section className="cc-group" key={group}>
            <h2>{GROUP_TITLES[group]}</h2>
            <div className="cc-grid">
              {services
                .filter((service) => service.group === group)
                .map((service) => (
                  <article className="cc-card" key={service.id} style={color(service.result.status)}>
                    <div className="cc-head">
                      <span className="cc-name">{service.name}</span>
                      <span className="cc-pill">{STATUS_LABEL[service.result.status]}</span>
                    </div>
                    <div className="cc-detail">{service.result.detail}</div>
                    <div className="cc-meta">
                      <span>{service.purpose}</span>
                      <span>Ответственный: {service.owner}</span>
                      {service.cost && <span>{service.cost}</span>}
                      {service.link && (
                        <a href={service.link} target={service.link.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
                          Открыть →
                        </a>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}

        <section className="cc-group">
          <h2>Агенты: кто что делает</h2>
          <div className="cc-agents">
            {(["Claude", "Codex", "Другие"] as AgentName[]).map((name) => (
              <AgentColumn key={name} name={name} prs={agents.byAgent[name]} />
            ))}
          </div>
          <p className="cc-note">
            {agents.ok
              ? `Открытая задача = открытый PR в GitHub. Пересечений: ${agents.conflictCount} · ждут твоего решения: ${agents.ownerCount} · зависли дольше 14 дней: ${agents.staleCount}.`
              : `GitHub не ответил (${agents.error}) — список агентов обновится позже.`}
          </p>
        </section>

        <section className="cc-group">
          <h2>Карта проектов</h2>
          <div className="cc-projects">
            {PROJECTS.map((project) => (
              <div className="cc-proj" key={project.name}>
                <small style={{ color: project.state === "active" ? "var(--ok)" : project.state === "planned" ? "var(--warn)" : "var(--unknown)" }}>
                  {PROJECT_STATE[project.state]}
                </small>
                <b>{project.link ? <a href={project.link} style={{ color: "inherit" }}>{project.name}</a> : project.name}</b>
                <p>{project.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
