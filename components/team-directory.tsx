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
  compensation: Compensation;
};

type PayType = "NONE" | "SALARY" | "HOURLY" | "COMMISSION" | "PIECEWORK" | "FIXED_PER_JOB";

type PieceRate = {
  serviceTypeId: string | null;
  serviceAddonId: string | null;
  personalRate: number | null;
  isEnabled: boolean;
};

type Compensation = {
  payType: PayType;
  monthlySalary: number;
  hourlyRate: number;
  commissionPercent: number;
  fixedPerJob: number;
  notes: string | null;
  pieceRates: PieceRate[];
};

type CompensationCatalog = Array<{
  directionCode: string;
  directionName: string;
  serviceTypeId: string;
  unitType: string;
  companyDefaultRate: number;
  addons: Array<{
    serviceAddonId: string;
    name: string;
    unitType: string;
    companyDefaultRate: number;
  }>;
}>;

const PAY_TYPE_OPTIONS: Array<{ value: PayType; label: string }> = [
  { value: "NONE", label: "Не начислять через CRM" },
  { value: "SALARY", label: "Оклад в месяц" },
  { value: "PIECEWORK", label: "Сдельная оплата по услугам" },
  { value: "COMMISSION", label: "Процент от оплаченных проектов" },
  { value: "FIXED_PER_JOB", label: "Фикс за завершённую работу" },
];

function compensationLabel(compensation: Compensation) {
  if (compensation.payType === "SALARY") return `$${compensation.monthlySalary.toLocaleString("en-US")}/мес`;
  if (compensation.payType === "PIECEWORK") return `Сдельно · ${compensation.pieceRates.length} поз.`;
  if (compensation.payType === "COMMISSION") return `${compensation.commissionPercent}% от оплаты`;
  if (compensation.payType === "FIXED_PER_JOB") return `$${compensation.fixedPerJob}/работа`;
  if (compensation.payType === "HOURLY") return `$${compensation.hourlyRate}/час`;
  return "Не настроено";
}

const ROLE_OPTIONS = [
  { code: "OWNER", label: "Владелец", hint: "всё, включая сотрудников и финансы" },
  { code: "MANAGER", label: "Менеджер", hint: "лиды, сделки, КП, свои клиенты" },
  { code: "CONSULTANT", label: "Замерщик", hint: "свои замеры, без цен" },
  { code: "INSTALLER", label: "Специалист по установке", hint: "свои объекты, без цен" },
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
  compensationCatalog = [],
  initialEditUserId,
}: {
  members: Member[];
  ownUserId: string;
  minPasswordLength: number;
  previewName?: string;
  compensationCatalog?: CompensationCatalog;
  initialEditUserId?: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<Member | "new" | null>(
    initialMembers.find((member) => member.userId === initialEditUserId) ?? null,
  );
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

  async function archive(member: Member) {
    const confirmed = window.confirm(
      `Удалить сотрудника «${member.fullName}»?\n\nВход будет отключён, сотрудник исчезнет из новых назначений. Старые проекты, работы и начисления сохранятся.`,
    );
    if (!confirmed) return;

    try {
      await api(`/api/v1/team/${member.userId}`, "DELETE");
      setNotice({
        tone: "ok",
        text: `${member.fullName} удалён(а) из команды. История сохранена; при необходимости сотрудника можно восстановить из архива.`,
      });
      if (window.top && window.top !== window) {
        window.top.postMessage({ type: "rolanpro-team-changed" }, window.location.origin);
      }
      await reload();
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
        onArchive={archive}
      />
      {inactive.length ? (
        <details className={styles.archive}>
          <summary>Архив сотрудников ({inactive.length})</summary>
          <p className={styles.muted}>
            Здесь находятся удалённые и отключённые сотрудники. Их история сохранена; восстановить доступ можно через «Изменить».
          </p>
          <MemberList
            title="Удалённые и отключённые"
            members={inactive}
            ownUserId={ownUserId}
            onEdit={setEditing}
            onPreview={preview}
            onArchive={archive}
          />
        </details>
      ) : null}

      {editing ? (
        <MemberForm
          member={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.userId === ownUserId}
          minPasswordLength={minPasswordLength}
          compensationCatalog={compensationCatalog}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
            if (window.top && window.top !== window) {
              window.top.postMessage({ type: "rolanpro-team-changed" }, window.location.origin);
            }
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
  onArchive,
}: {
  title: string;
  members: Member[];
  ownUserId: string;
  onEdit: (member: Member) => void;
  onPreview: (member: Member) => void;
  onArchive: (member: Member) => void;
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
              <span className={styles.paySummary}>Зарплата: {compensationLabel(member.compensation)}</span>
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
              {member.userId !== ownUserId && member.isActive ? (
                <button className={styles.danger} onClick={() => onArchive(member)}>
                  Удалить
                </button>
              ) : null}
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
  compensationCatalog,
  onClose,
  onSaved,
}: {
  member: Member | null;
  isSelf: boolean;
  minPasswordLength: number;
  compensationCatalog: CompensationCatalog;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [roles, setRoles] = useState<string[]>(member?.roles ?? ["INSTALLER"]);
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [payType, setPayType] = useState<PayType>(member?.compensation.payType ?? "PIECEWORK");
  const [monthlySalary, setMonthlySalary] = useState(String(member?.compensation.monthlySalary || ""));
  const [hourlyRate, setHourlyRate] = useState(String(member?.compensation.hourlyRate || ""));
  const [commissionPercent, setCommissionPercent] = useState(String(member?.compensation.commissionPercent || ""));
  const [fixedPerJob, setFixedPerJob] = useState(String(member?.compensation.fixedPerJob || ""));
  const [compensationNotes, setCompensationNotes] = useState(member?.compensation.notes ?? "");
  const initialRates = new Map(
    (member?.compensation.pieceRates ?? []).map((rate) => [
      rate.serviceTypeId ? `service:${rate.serviceTypeId}` : `addon:${rate.serviceAddonId}`,
      { enabled: rate.isEnabled, personalRate: rate.personalRate === null ? "" : String(rate.personalRate) },
    ]),
  );
  if (!member) {
    compensationCatalog.forEach((direction) => initialRates.set(`service:${direction.serviceTypeId}`, { enabled: true, personalRate: "" }));
  }
  const [pieceRates, setPieceRates] = useState(initialRates);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(code: string) {
    setRoles((current) => (current.includes(code) ? current.filter((role) => role !== code) : [...current, code]));
  }

  function updatePieceRate(key: string, update: Partial<{ enabled: boolean; personalRate: string }>) {
    setPieceRates((current) => {
      const next = new Map(current);
      next.set(key, { enabled: false, personalRate: "", ...(current.get(key) ?? {}), ...update });
      return next;
    });
  }

  function compensationPayload() {
    const selected: PieceRate[] = [];
    compensationCatalog.forEach((direction) => {
      const base = pieceRates.get(`service:${direction.serviceTypeId}`);
      if (base?.enabled) selected.push({
        serviceTypeId: direction.serviceTypeId,
        serviceAddonId: null,
        personalRate: base.personalRate === "" ? null : Number(base.personalRate),
        isEnabled: true,
      });
      direction.addons.forEach((addon) => {
        const row = pieceRates.get(`addon:${addon.serviceAddonId}`);
        if (row?.enabled) selected.push({
          serviceTypeId: null,
          serviceAddonId: addon.serviceAddonId,
          personalRate: row.personalRate === "" ? null : Number(row.personalRate),
          isEnabled: true,
        });
      });
    });
    return {
      payType,
      monthlySalary: Number(monthlySalary || 0),
      hourlyRate: Number(hourlyRate || 0),
      commissionPercent: Number(commissionPercent || 0),
      fixedPerJob: Number(fixedPerJob || 0),
      notes: compensationNotes,
      pieceRates: selected,
    };
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
        await api("/api/v1/team", "POST", { email, fullName, roles, password, compensation: compensationPayload() });
        await onSaved(`${fullName} добавлен(а). Передайте почту и временный пароль лично — при первом входе CRM попросит его сменить.`);
      } else {
        await api(`/api/v1/team/${member.userId}`, "PATCH", {
          email,
          fullName,
          roles,
          isActive,
          ...(password ? { password } : {}),
          compensation: compensationPayload(),
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

        <fieldset className={`${styles.field} ${styles.compensation}`}>
          <legend>Условия оплаты</legend>
          <p className={styles.muted}>Это источник расчёта зарплаты. Цена клиенту настраивается отдельно в «Услуги и цены».</p>
          <label className={styles.field}>
            <span>Как начислять</span>
            <select value={payType} onChange={(event) => setPayType(event.target.value as PayType)}>
              {PAY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          {payType === "SALARY" ? <MoneyField label="Оклад в месяц, $" value={monthlySalary} onChange={setMonthlySalary} /> : null}
          {payType === "COMMISSION" ? <MoneyField label="Процент от оплаченных проектов, %" value={commissionPercent} onChange={setCommissionPercent} step="0.1" /> : null}
          {payType === "FIXED_PER_JOB" ? <MoneyField label="За завершённую работу, $" value={fixedPerJob} onChange={setFixedPerJob} /> : null}

          {payType === "PIECEWORK" ? (
            <div className={styles.rateBook}>
              <p className={styles.rateHint}>Выберите работы сотрудника. Пустая персональная ставка означает: брать ставку компании из справочника.</p>
              {compensationCatalog.map((direction) => (
                <details className={styles.directionRates} key={direction.serviceTypeId} open>
                  <summary>{direction.directionName}</summary>
                  <RateRow
                    label={`Монтаж · ${direction.directionName}`}
                    unitType={direction.unitType}
                    companyDefaultRate={direction.companyDefaultRate}
                    value={pieceRates.get(`service:${direction.serviceTypeId}`)}
                    onChange={(update) => updatePieceRate(`service:${direction.serviceTypeId}`, update)}
                  />
                  {direction.addons.map((addon) => (
                    <RateRow
                      key={addon.serviceAddonId}
                      label={addon.name}
                      unitType={addon.unitType}
                      companyDefaultRate={addon.companyDefaultRate}
                      value={pieceRates.get(`addon:${addon.serviceAddonId}`)}
                      onChange={(update) => updatePieceRate(`addon:${addon.serviceAddonId}`, update)}
                    />
                  ))}
                </details>
              ))}
            </div>
          ) : null}

          <label className={styles.field}>
            <span>Примечание (необязательно)</span>
            <textarea value={compensationNotes} onChange={(event) => setCompensationNotes(event.target.value)} rows={2} />
          </label>
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

function MoneyField({ label, value, onChange, step = "0.01" }: { label: string; value: string; onChange: (value: string) => void; step?: string }) {
  return <label className={styles.field}>
    <span>{label}</span>
    <input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} required />
  </label>;
}

function RateRow({
  label,
  unitType,
  companyDefaultRate,
  value,
  onChange,
}: {
  label: string;
  unitType: string;
  companyDefaultRate: number;
  value?: { enabled: boolean; personalRate: string };
  onChange: (update: Partial<{ enabled: boolean; personalRate: string }>) => void;
}) {
  const enabled = value?.enabled ?? false;
  return <div className={styles.rateRow}>
    <label className={styles.rateCheck}>
      <input type="checkbox" checked={enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
      <span><strong>{label}</strong><small>Ставка компании: ${companyDefaultRate}/{unitType}</small></span>
    </label>
    <label className={styles.override}>
      <span>Персонально</span>
      <input
        type="number"
        min="0"
        step="0.01"
        disabled={!enabled}
        value={value?.personalRate ?? ""}
        placeholder={String(companyDefaultRate)}
        onChange={(event) => onChange({ personalRate: event.target.value })}
      />
      <small>$/{unitType}</small>
    </label>
  </div>;
}
