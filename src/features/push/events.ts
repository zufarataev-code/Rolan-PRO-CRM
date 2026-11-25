/**
 * Which CRM events go to a phone as a push, who gets each one, and what the
 * push says. Only these four kinds are pushed; everything else stays in the
 * CRM's bell. Pure functions, so every rule here is covered by tests.
 */

export type PushKind = "new_lead" | "assigned_measure" | "assigned_install" | "measurement_done" | "proposal_accepted" | "test";

export type PushEvent = {
  /** Same key → one push per person, however many times the event is seen. */
  key: string;
  kind: PushKind;
  title: string;
  body: string;
  url: string;
  /** PostgreSQL user ids. */
  recipients: string[];
};

/** A field employee's push never names money: a lock screen is seen by anyone. */
const MONEY_PATTERNS = [
  /(?:US)?\$\s?\d[\d\s,.]*(?:\s?(?:k|K|тыс\.?))?/g,
  /\d[\d\s,.]*\s?(?:\$|USD|долларов|доллара|доллар|долл\.?|dollars?)/gi,
  /\bUSD\b/g,
];

export function stripMoney(text: string) {
  let out = text;
  for (const pattern of MONEY_PATTERNS) out = out.replace(pattern, "");
  return out
    .replace(/\s+([,.;:·])/g, "$1")
    .replace(/(?:\s*[·,;:]\s*){2,}/g, " · ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·,;:]+|[\s·,;:]+$/g, "")
    .trim();
}

export function clip(text: string, max: number) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export const OFFICE_ROLES = new Set(["OWNER", "MANAGER"]);

/** The text one person sees: office roles get it as written, field roles without money. */
export function textForRecipient(roles: readonly string[], event: Pick<PushEvent, "title" | "body">) {
  const office = roles.some((role) => OFFICE_ROLES.has(role));
  const title = clip(office ? event.title : stripMoney(event.title), 90) || "RolanPRO";
  const body = clip(office ? event.body : stripMoney(event.body), 220);
  return { title, body };
}

const TIME_ZONE = "America/Los_Angeles";

export function formatVisit(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/* ---------- old CRM (LegacyWorkspace payload) ---------- */

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const CLOSED_STATUSES = new Set(["installation_done", "act_signed", "payment_received", "completed", "review_received", "cancelled", "canceled", "lost"]);
/** Past visits (an old project entered afterwards) are not news. */
const PAST_VISIT_GRACE_MS = 24 * 60 * 60 * 1000;
/** A save that would push more than this is an import or a mass edit: nothing is pushed. */
export const MAX_EVENTS_PER_SAVE = 20;

function ordersOf(payload: unknown) {
  const orders = isObject(payload) && Array.isArray(payload.orders) ? payload.orders : [];
  return orders.filter(isObject);
}

function clientLine(payload: unknown, order: JsonObject) {
  const clients = isObject(payload) && Array.isArray(payload.clients) ? payload.clients.filter(isObject) : [];
  const client = clients.find((item) => String(item.id ?? "") === String(order.clientId ?? ""));
  const name = typeof client?.name === "string" ? client.name : "";
  const address = typeof order.address === "string" && order.address ? order.address : typeof client?.address === "string" ? client.address : "";
  return { name, address };
}

function orderUrl(order: JsonObject) {
  return `/legacy-crm#/order/${encodeURIComponent(String(order.id ?? ""))}`;
}

function futureOrUnknown(value: unknown, now: number) {
  if (typeof value !== "string" || !value) return true;
  const time = Date.parse(value);
  return Number.isNaN(time) || time >= now - PAST_VISIT_GRACE_MS;
}

export type LegacyPeople = {
  /** Legacy user id → PostgreSQL user id. */
  userIdForLegacy: (legacyId: string) => string | null;
  ownerUserIds: string[];
  /** Who saved: never pushed about their own action. */
  actorUserId: string | null;
};

function people(ids: Array<string | null | undefined>, map: LegacyPeople, extra: string[] = []) {
  const out = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    const user = map.userIdForLegacy(String(id));
    if (user) out.add(user);
  }
  for (const id of extra) out.add(id);
  if (map.actorUserId) out.delete(map.actorUserId);
  return [...out];
}

/**
 * Compares the old CRM before and after one save and returns the pushes it
 * causes: a measurer or installer newly put on a project, a measurement
 * marked done, a client accepting the proposal. Texts carry no money.
 */
export function legacyPushEvents(before: unknown, after: unknown, map: LegacyPeople, now = Date.now()): PushEvent[] {
  const previous = new Map(ordersOf(before).map((order) => [String(order.id ?? ""), order]));
  const events: PushEvent[] = [];

  for (const order of ordersOf(after)) {
    const id = String(order.id ?? "");
    if (!id) continue;
    const prev = previous.get(id);
    const status = String(order.status ?? "");
    const number = typeof order.number === "string" && order.number ? order.number : "Проект";
    const { name, address } = clientLine(after, order);
    const url = orderUrl(order);

    if (!CLOSED_STATUSES.has(status)) {
      const measurer = typeof order.measurerId === "string" ? order.measurerId : "";
      if (measurer && measurer !== (prev?.measurerId ?? "") && futureOrUnknown(order.measurementAt, now)) {
        events.push({
          key: `legacy:measure:${id}:${measurer}:${order.measurementAt ?? ""}`,
          kind: "assigned_measure",
          title: "Вам назначен замер",
          body: [number, name, formatVisit(order.measurementAt), address].filter(Boolean).join(" · "),
          url,
          recipients: people([measurer], map),
        });
      }

      const wasOn = new Set(Array.isArray(prev?.installerIds) ? prev.installerIds.map(String) : []);
      const added = (Array.isArray(order.installerIds) ? order.installerIds.map(String) : []).filter((installer) => installer && !wasOn.has(installer));
      if (added.length && futureOrUnknown(order.installationAt, now)) {
        for (const installer of added) {
          events.push({
            key: `legacy:install:${id}:${installer}:${order.installationAt ?? ""}`,
            kind: "assigned_install",
            title: "Вам назначен монтаж",
            body: [number, name, formatVisit(order.installationAt), address].filter(Boolean).join(" · "),
            url,
            recipients: people([installer], map),
          });
        }
      }
    }

    if (!prev) continue;

    if (status === "measurement_done" && String(prev.status ?? "") !== "measurement_done") {
      events.push({
        key: `legacy:measured:${id}:${order.measurementDoneAt ?? ""}`,
        kind: "measurement_done",
        title: "Замер внесён",
        body: [number, name, "можно готовить КП"].filter(Boolean).join(" · "),
        url,
        recipients: people([typeof order.managerId === "string" ? order.managerId : null], map),
      });
    }

    const acceptedNow = Boolean(order.proposalAcceptedAt) && !prev.proposalAcceptedAt;
    const acceptedStatus = status === "proposal_accepted" && String(prev.status ?? "") !== "proposal_accepted";
    if (acceptedNow || acceptedStatus) {
      events.push({
        key: `legacy:accepted:${id}`,
        kind: "proposal_accepted",
        title: "Клиент принял КП",
        body: [number, name].filter(Boolean).join(" · "),
        url,
        recipients: people([typeof order.managerId === "string" ? order.managerId : null], map, map.ownerUserIds),
      });
    }
  }

  const real = events.filter((event) => event.recipients.length > 0);
  return real.length > MAX_EVENTS_PER_SAVE ? [] : real;
}

/* ---------- new CRM (PostgreSQL) ---------- */

export type PgNotificationRow = {
  notification_id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  type_key: string;
  title: string;
  message: string;
  entity_type: string | null;
};

export type PgLeadRow = {
  lead_id: string;
  name: string;
  source: string | null;
  assigned_manager_id: string | null;
};

const PG_TYPE_KINDS: Record<string, { kind: PushKind; withOwners: boolean; title: string }> = {
  "installation.assigned": { kind: "assigned_install", withOwners: false, title: "Вам назначен монтаж" },
  "installation.phase_assigned": { kind: "assigned_install", withOwners: false, title: "Вам назначен этап монтажа" },
  "project.manual_assigned": { kind: "assigned_install", withOwners: false, title: "Вам назначен проект" },
  "consultation.assigned": { kind: "assigned_measure", withOwners: false, title: "Вам назначен замер" },
  "survey.completed": { kind: "measurement_done", withOwners: false, title: "Замер внесён" },
  "agreement.signed": { kind: "proposal_accepted", withOwners: true, title: "Клиент принял КП" },
  "proposal.approved": { kind: "proposal_accepted", withOwners: true, title: "Клиент принял КП" },
};

export const PG_PUSH_TYPES = Object.keys(PG_TYPE_KINDS);

export function pgNotificationEvents(rows: PgNotificationRow[], ownerUserIds: string[]): PushEvent[] {
  const events: PushEvent[] = [];
  for (const row of rows) {
    const rule = PG_TYPE_KINDS[row.type_key];
    if (!rule) continue;
    const recipients = new Set([row.recipient_user_id, ...(rule.withOwners ? ownerUserIds : [])]);
    if (row.actor_user_id) recipients.delete(row.actor_user_id);
    events.push({
      key: `pg:notification:${row.notification_id}`,
      kind: rule.kind,
      title: rule.title,
      body: row.message || row.title,
      url: rule.kind === "proposal_accepted" || rule.kind === "measurement_done" ? "/crm/projects" : "/legacy-crm",
      recipients: [...recipients],
    });
  }
  return events.filter((event) => event.recipients.length > 0);
}

/** A new lead: the owners and its manager, or every manager when nobody has it yet. */
export function newLeadEvents(leads: PgLeadRow[], ownerUserIds: string[], managerUserIds: string[]): PushEvent[] {
  return leads
    .map((lead) => ({
      key: `pg:lead:${lead.lead_id}`,
      kind: "new_lead" as const,
      title: "Новый лид",
      body: [lead.name, lead.source].filter(Boolean).join(" · "),
      url: "/crm/leads",
      recipients: [...new Set([...ownerUserIds, ...(lead.assigned_manager_id ? [lead.assigned_manager_id] : managerUserIds)])],
    }))
    .filter((event) => event.recipients.length > 0);
}
