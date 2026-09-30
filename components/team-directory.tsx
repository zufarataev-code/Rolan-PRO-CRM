"use client";

import { FormEvent, useState } from "react";

import styles from "./team-directory.module.css";

type Member = {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

const ROLE_OPTIONS = [
  { code: "OWNER", label: "Владелец", hint: "всё, включая сотрудников и финансы" },
  { code: "MANAGER", label: "Менеджер", hint: "лиды, сделки, КП, свои клиенты" },
  { code: "CONSULTANT", label: "Замерщик", hint: "свои замеры, без цен" },
  { code: "INSTALLER", label: "Монтажник", hint: "свои объекты, без цен" },
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
          <h1>Сотрудники</h1>
          <p className={styles.muted}>Единый список. Роли и доступ меняются здесь и сразу действуют везде.</p>
        </div>
        <button className={styles.primary} onClick={() => setEditing("new")}>
          + Добавить сотрудника
        </button>
      </header>

      {notice ? (
        <p className={notice.tone === "ok" ? styles.ok : styles.error} role="status">
          {notice.text}
        </p>
      ) : null}

      <MemberList
        title={`Работают (${active.length})`}
        members={active}
        ownUserId={ownUserId}
        onEdit={setEditing}
        onPreview={preview}
      />
      {inactive.length ? (
        <MemberList
          title={`Доступ выключен (${inactive.length})`}
          members={inactive}
          ownUserId={ownUserId}
          onEdit={setEditing}
          onPreview={preview}
        />
      ) : null}

      {editing ? (
        <MemberForm
          member={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.userId === ownUserId}
          minPasswordLength={minPasswordLength}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
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
  ownUserId,
  onEdit,
  onPreview,
}: {
  title: string;
  members: Member[];
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
  isSelf,
  minPasswordLength,
  onClose,
  onSaved,
}: {
  member: Member | null;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(code: string) {
    setRoles((current) => (current.includes(code) ? current.filter((role) => role !== code) : [...current, code]));
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
          <button type="button" className={styles.secondary} onClick={onClose}>Отмена</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  );
}
