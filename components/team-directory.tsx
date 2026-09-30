"use client";

import { FormEvent, useState } from "react";

import { RateDirectory } from "./rate-directory";
import styles from "./team-directory.module.css";

type Member = {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  installerLeadId?: string | null;
};

const ROLE_OPTIONS = [
  { code: "OWNER", label: "Владелец", hint: "всё, включая сотрудников и финансы" },
  { code: "MANAGER", label: "Менеджер", hint: "лиды, сделки, КП, свои клиенты" },
  { code: "CONSULTANT", label: "Замерщик", hint: "свои замеры, без цен" },
  { code: "INSTALLER", label: "Главный специалист по установке", hint: "свои объекты, без цен" },
  { code: "INSTALLER_LEAD", label: "Руководитель монтажной группы", hint: "распределяет работы группы, +10% с каждого монтажника, без цен" },
] as const;

const roleLabel = (code: string) => ROLE_OPTIONS.find((role) => role.code === code)?.label ?? code;

/** The page runs inside the CRM overlay; navigate the CRM window, not the frame. */
function goTo(path: string) {
  (window.top ?? window).location.assign(path);
}

function closePanel() {
  if (window.top && window.top !== window) {
    window.top.postMessage({ type: "rolanpro-team-close" }, window.location.origin);
  } else {
    location.assign("/legacy-crm");
  }
}

/** Tells the CRM window to reload its data when this overlay closes. */
function notifyCrmChanged() {
  if (window.top && window.top !== window) {
    window.top.postMessage({ type: "rolanpro-team-changed" }, window.location.origin);
  }
}

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.errors?.[0]?.message || "Не удалось сохранить. Попробуйте ещё раз.");
  }
  return json?.data;
}

export function TeamDirectory({
  members: initialMembers,
  ownUserId,
  minPasswordLength,
  previewName,
}: {
  members: Member[];
  ownUserId: string;
  minPasswordLength: number;
  previewName?: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"team" | "rates">("team");

  if (previewName) {
    return (
      <div className={styles.shell}><main className={styles.page}>
        <section className={styles.card}>
          <h1>Режим просмотра</h1>
          <p>Сейчас вы смотрите CRM глазами сотрудника: {previewName}.</p>
          <button
            className={styles.primary}
            onClick={async () => {
              await fetch("/api/v1/team/preview", { method: "DELETE" });
              goTo("/legacy-crm?panel=team");
            }}
          >
            Выйти из просмотра
          </button>
        </section>
      </main></div>
    );
  }

  async function reload() {
    const list = (await api("/api/v1/team", "GET")) as Array<Member & { lastLoginAt: string | null }>;
    setMembers(list.filter((member) => !member.roles.every((role) => role === "AI_SERVICE")));
  }

  async function preview(member: Member) {
    try {
      await api("/api/v1/team/preview", "POST", { userId: member.userId });
      goTo("/legacy-crm");
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  }

  const active = members.filter((member) => member.isActive);
  const inactive = members.filter((member) => !member.isActive);

  return (
    <div className={styles.shell}><main className={styles.page}>
      <header className={styles.header}>
        <div>
          <button type="button" className={styles.back} onClick={closePanel}>← В CRM</button>
          <h1>{tab === "team" ? "Сотрудники" : "Расценки"}</h1>
          <p className={styles.muted}>
            {tab === "team"
              ? "Единый список. Роли и доступ меняются здесь и сразу действуют везде."
              : "Справочник для зарплаты и рентабельности. Изменения действуют сразу."}
          </p>
        </div>
        {tab === "team" ? (
          <button className={styles.primary} onClick={() => setEditing("new")}>
            + Добавить сотрудника
          </button>
        ) : null}
      </header>

      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "team"} className={tab === "team" ? styles.tabActive : styles.tab} onClick={() => setTab("team")}>
          Сотрудники
        </button>
        <button role="tab" aria-selected={tab === "rates"} className={tab === "rates" ? styles.tabActive : styles.tab} onClick={() => setTab("rates")}>
          Расценки
        </button>
      </div>

      {tab === "rates" ? <RateDirectory onChanged={notifyCrmChanged} /> : null}

      {tab === "team" && notice ? (
        <p className={notice.tone === "ok" ? styles.ok : styles.error} role="status">
          {notice.text}
        </p>
      ) : null}

      {tab === "team" ? <>
      <MemberList
        title={`Работают (${active.length})`}
        members={active}
        allMembers={members}
        ownUserId={ownUserId}
        onEdit={setEditing}
        onPreview={preview}
      />
      {inactive.length ? (
        <MemberList
          title={`Доступ выключен (${inactive.length})`}
          members={inactive}
          allMembers={members}
          ownUserId={ownUserId}
          onEdit={setEditing}
          onPreview={preview}
        />
      ) : null}
      </> : null}

      {editing ? (
        <MemberForm
          member={editing === "new" ? null : editing}
          leads={members.filter((item) => item.isActive && item.roles.includes("INSTALLER_LEAD"))}
          installers={members.filter((item) => item.isActive && item.roles.includes("INSTALLER"))}
          isSelf={editing !== "new" && editing.userId === ownUserId}
          minPasswordLength={minPasswordLength}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
            notifyCrmChanged();
            await reload();
          }}
        />
      ) : null}
    </main></div>
  );
}

function MemberList({
  title,
  members,
  allMembers,
  ownUserId,
  onEdit,
  onPreview,
}: {
  title: string;
  members: Member[];
  allMembers: Member[];
  ownUserId: string;
  onEdit: (member: Member) => void;
  onPreview: (member: Member) => void;
}) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      <ul className={styles.list}>
        {members.map((member) => (
          <li key={member.userId} className={styles.row}>
            <div className={styles.person}>
              <strong>{member.fullName}</strong>
              <span className={styles.muted}>{member.email}</span>
              <span className={styles.roles}>
                {member.roles.map((role) => (
                  <span key={role} className={styles.role}>{roleLabel(role)}</span>
                ))}
                {member.mustChangePassword ? <span className={styles.warn}>ждёт первого входа</span> : null}
                {member.installerLeadId ? (
                  <span className={styles.role}>
                    группа: {allMembers.find((lead) => lead.userId === member.installerLeadId)?.fullName ?? "—"}
                  </span>
                ) : null}
              </span>
            </div>
            <div className={styles.actions}>
              {member.userId !== ownUserId && member.isActive && !member.roles.includes("OWNER") ? (
                <button className={styles.secondary} onClick={() => onPreview(member)}>
                  Посмотреть глазами
                </button>
              ) : null}
              <button className={styles.secondary} onClick={() => onEdit(member)}>
                Изменить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemberForm({
  member,
  leads,
  installers,
  isSelf,
  minPasswordLength,
  onClose,
  onSaved,
}: {
  member: Member | null;
  leads: Member[];
  installers: Member[];
  isSelf: boolean;
  minPasswordLength: number;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [roles, setRoles] = useState<string[]>(member?.roles ?? ["INSTALLER"]);
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [installerLeadId, setInstallerLeadId] = useState<string>(member?.installerLeadId ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(
    member ? installers.filter((item) => item.installerLeadId === member.userId).map((item) => item.userId) : [],
  );
  const MAX_GROUP = 5;
  function toggleGroupMember(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_GROUP ? current : [...current, id],
    );
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(code: string) {
    setRoles((current) => {
      if (current.includes(code)) return current.filter((role) => role !== code);
      // A team lead works on sites too, so the lead role always comes with the installer role.
      if (code === "INSTALLER_LEAD" && !current.includes("INSTALLER")) return [...current, "INSTALLER", code];
      return [...current, code];
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!roles.length) return setError("Выберите хотя бы одну роль.");
    if (!member && password.length < minPasswordLength) {
      return setError(`Временный пароль — не короче ${minPasswordLength} символов.`);
    }
    if (member && password && password.length < minPasswordLength) {
      return setError(`Новый пароль — не короче ${minPasswordLength} символов.`);
    }

    setBusy(true);
    try {
      if (!member) {
        await api("/api/v1/team", "POST", { email, fullName, roles, password });
        await onSaved(`${fullName} добавлен(а). Передайте почту и временный пароль лично — при первом входе CRM попросит его сменить.`);
      } else {
        await api(`/api/v1/team/${member.userId}`, "PATCH", {
          email,
          fullName,
          roles,
          isActive,
          installerLeadId: roles.includes("INSTALLER") && installerLeadId ? installerLeadId : null,
          ...(roles.includes("INSTALLER_LEAD") ? { groupInstallerIds: groupIds } : {}),
          ...(password ? { password } : {}),
        });
        await onSaved(password ? `Сохранено. Новый временный пароль для ${fullName} действует со следующего входа.` : "Сохранено.");
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className={styles.dialog} onSubmit={submit}>
        <h2>{member ? `Сотрудник: ${member.fullName}` : "Новый сотрудник"}</h2>

        <label className={styles.field}>
          <span>Имя</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>Почта для входа</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>

        <fieldset className={styles.field} disabled={isSelf}>
          <span>Роли {isSelf ? "(свои роли менять нельзя)" : "— можно несколько"}</span>
          {ROLE_OPTIONS.map((role) => (
            <label key={role.code} className={styles.check}>
              <input type="checkbox" checked={roles.includes(role.code)} onChange={() => toggleRole(role.code)} />
              <span>
                <strong>{role.label}</strong> <span className={styles.muted}>{role.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {roles.includes("INSTALLER_LEAD") && member ? (
          <fieldset className={styles.field}>
            <span>Монтажники группы ({groupIds.length} из {MAX_GROUP}) — получает 10% с заработка каждого</span>
            {installers
              .filter((item) => item.userId !== member.userId)
              .map((item) => (
                <label key={item.userId} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(item.userId)}
                    disabled={!groupIds.includes(item.userId) && groupIds.length >= MAX_GROUP}
                    onChange={() => toggleGroupMember(item.userId)}
                  />
                  <span>
                    {item.fullName}
                    {item.installerLeadId && item.installerLeadId !== member.userId ? (
                      <span className={styles.muted}> · сейчас в другой группе</span>
                    ) : null}
                  </span>
                </label>
              ))}
          </fieldset>
        ) : null}

        {roles.includes("INSTALLER") && !roles.includes("INSTALLER_LEAD") && member ? (
          <label className={styles.field}>
            <span>Руководитель монтажной группы</span>
            <select id="tm-installer-lead" value={installerLeadId} onChange={(event) => setInstallerLeadId(event.target.value)}>
              <option value="">— без группы —</option>
              {leads
                .filter((lead) => lead.userId !== member.userId)
                .map((lead) => (
                  <option key={lead.userId} value={lead.userId}>{lead.fullName}</option>
                ))}
            </select>
          </label>
        ) : null}

        {member && !isSelf ? (
          <label className={styles.check}>
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span>Доступ в CRM включён</span>
          </label>
        ) : null}

        <label className={styles.field}>
          <span>{member ? "Новый временный пароль (необязательно)" : "Временный пароль"}</span>
          <input
            type="text"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`не короче ${minPasswordLength} символов`}
            required={!member}
          />
        </label>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.dialogActions}>
          {member && !isSelf && member.isActive ? (
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Убрать ${member.fullName}? Доступ в CRM закроется, история заказов и зарплаты сохранится.`)) return;
                setBusy(true);
                try {
                  await api(`/api/v1/team/${member.userId}`, "PATCH", { isActive: false });
                  await onSaved(`${member.fullName} убран(а): доступ закрыт, история сохранена. Вернуть можно в разделе «Доступ выключен».`);
                } catch (caught) {
                  setError((caught as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Убрать сотрудника
            </button>
          ) : null}
          <button type="button" className={styles.secondary} onClick={onClose}>Отмена</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  );
}
