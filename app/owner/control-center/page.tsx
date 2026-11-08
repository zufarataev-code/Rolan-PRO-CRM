import { redirect } from "next/navigation";

import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { getControlCenterSnapshot } from "@/features/owner/control-center";
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
@media(max-width:560px){.cc-sum{grid-template-columns:repeat(2,1fr)}.cc h1{font-size:22px}}
`;

const color = (status: ServiceStatus) => ({ "--c": `var(--${status})` }) as React.CSSProperties;

export default async function ControlCenterPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);
  if (!session) redirect("/");

  const { checkedAt, services } = await getControlCenterSnapshot();
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
