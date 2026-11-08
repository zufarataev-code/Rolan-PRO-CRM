/**
 * Центр управления: живая картина работы и денег по проектам.
 *
 * Источник — рабочая CRM (`/legacy-crm`), которой реально пользуется команда:
 * заказы лежат в `LegacyWorkspace.payload.orders`. Здесь только чтение и
 * сводка — ничего не пишется, формулы CRM не дублируются.
 *
 * Сумма проекта берётся ТОЛЬКО из утверждённой сметы
 * (`projectEstimateSnapshot.revenue`), которую CRM фиксирует при принятии КП.
 * Пересчитывать цену по окнам на сервере нельзя — прайс живёт в браузерной
 * логике, и придуманная цифра хуже честного «нет суммы».
 */

type Row = Record<string, any>;

export type OpsStageKey = "lead" | "survey" | "proposal" | "install" | "closing";

export const OPS_STAGES: { key: OpsStageKey; title: string; statuses: string[] }[] = [
  { key: "lead", title: "Новые и консультация", statuses: ["new", "consultation_scheduled"] },
  { key: "survey", title: "Замер", statuses: ["measurement_scheduled", "measurement_done"] },
  { key: "proposal", title: "КП и решение клиента", statuses: ["proposal_sent", "proposal_accepted"] },
  {
    key: "install",
    title: "Монтаж",
    statuses: ["installation_scheduled", "installation_accepted", "installation_en_route", "installation_in_progress", "installation_done"],
  },
  { key: "closing", title: "Акт и оплата", statuses: ["act_signed", "payment_received"] },
];

const DONE_STATUSES = new Set(["completed", "review_received"]);
const LOST_STATUSES = new Set(["cancelled", "canceled", "lost"]);
/** From this point the client has agreed, so the unpaid part is money owed to us. */
const OWED_FROM = new Set([
  "proposal_accepted",
  ...OPS_STAGES.find((stage) => stage.key === "install")!.statuses,
  ...OPS_STAGES.find((stage) => stage.key === "closing")!.statuses,
  "completed",
  "review_received",
]);

const STATUS_RU: Record<string, string> = {
  new: "Новый",
  consultation_scheduled: "Консультация",
  measurement_scheduled: "Замер назначен",
  measurement_done: "Замер сделан",
  proposal_sent: "КП отправлено",
  proposal_accepted: "КП принято",
  installation_scheduled: "Монтаж назначен",
  installation_accepted: "Монтаж принят",
  installation_en_route: "Бригада в пути",
  installation_in_progress: "Идёт монтаж",
  installation_done: "Монтаж сделан",
  act_signed: "Акт подписан",
  payment_received: "Оплата получена",
};

export type OpsCard = {
  id: string;
  number: string;
  title: string;
  client: string;
  status: string;
  statusRu: string;
  /** Approved estimate, null when CRM has not fixed one yet. */
  total: number | null;
  paid: number;
  balance: number | null;
  installAt: string | null;
  updatedAt: string | null;
  link: string;
};

export type OpsSummary = {
  active: number;
  installsNext7: OpsCard[];
  receivable: number;
  receivableCount: number;
  withoutEstimate: number;
  received30: number;
  stages: { key: OpsStageKey; title: string; count: number; cards: OpsCard[] }[];
  debtors: OpsCard[];
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const validDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Automatic Stripe confirmation in the CRM adds to `o.paid` and `o.stripe`
 * but does not append to `o.payments`, so it is counted separately unless a
 * matching Stripe payment line already exists.
 */
function unrecordedStripe(order: Row): { amount: number; at: Date | null } | null {
  const stripe = order?.stripe;
  if (!stripe?.paid || !(num(stripe.amount) > 0)) return null;
  const payments: Row[] = Array.isArray(order.payments) ? order.payments : [];
  const at = validDate(stripe.paidAt);
  const sessionId = stripe.sessionId ? String(stripe.sessionId) : "";
  // Same transaction = it references the Stripe session, or it is a card line
  // for the same amount recorded within a day of the Stripe confirmation.
  // An unrelated earlier card payment of equal size does not hide Stripe.
  const recorded = payments.some((payment) => {
    if (sessionId && Object.values(payment ?? {}).some((value) => String(value) === sessionId)) return true;
    if (!/stripe|card/i.test(String(payment?.method ?? ""))) return false;
    if (Math.abs(num(payment?.amount) - num(stripe.amount)) >= 0.01) return false;
    const date = validDate(payment?.recordedAt ?? payment?.date);
    return Boolean(at && date && Math.abs(date.getTime() - at.getTime()) <= 86_400_000);
  });
  return recorded ? null : { amount: num(stripe.amount), at };
}

function paidTotal(order: Row) {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  if (!payments.length) return num(order.paid);
  return payments.reduce((sum: number, payment: Row) => sum + num(payment?.amount), 0) + (unrecordedStripe(order)?.amount ?? 0);
}

/** Upcoming work dates: per-service schedules first, the project date only for older projects. */
function upcomingInstall(order: Row, from: Date, to: Date): Date | null {
  const plans: Row[] = Array.isArray(order.serviceSchedules) ? order.serviceSchedules : [];
  const dates = plans.length
    ? plans.flatMap((plan) => {
        const start = validDate(plan?.installationAt);
        if (!start) return [];
        const end = validDate(plan?.endsAt);
        // A multi-day service already under way counts from today.
        if (start < from && end && end >= from) return [from];
        return [start];
      })
    : [validDate(order.installationAt)].filter((date): date is Date => Boolean(date));
  const upcoming = dates.filter((date) => date >= from && date <= to).sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

function approvedTotal(order: Row): number | null {
  const revenue = Number(order?.projectEstimateSnapshot?.revenue);
  return Number.isFinite(revenue) && revenue > 0 ? revenue : null;
}

/** Same rule as the CRM: an unconfirmed historical import is not company money yet. */
function isHistoricalDraft(order: Row) {
  return order?.quickEntryDraft === true && order?.quickProjectImportedCompleted !== true;
}

function toCard(order: Row, clients: Map<string, string>): OpsCard {
  const total = approvedTotal(order);
  const paid = paidTotal(order);
  const id = String(order.id ?? "");
  return {
    id,
    number: String(order.number ?? ""),
    title: String(order.title ?? order.address ?? "Проект"),
    client: clients.get(String(order.clientId ?? "")) ?? "Клиент не указан",
    status: String(order.status ?? ""),
    statusRu: STATUS_RU[String(order.status ?? "")] ?? String(order.status ?? "—"),
    total,
    paid,
    balance: total === null ? null : Math.max(total - paid, 0),
    installAt: validDate(order.installationAt)?.toISOString() ?? null,
    updatedAt: validDate(order.updatedAt)?.toISOString() ?? null,
    link: `/legacy-crm#/order/${encodeURIComponent(id)}`,
  };
}

/** Only confirmed installations; `proposal_accepted` schedules are internal drafts the CRM calendar hides. */
const INSTALL_LISTED = new Set(["installation_scheduled", "installation_accepted", "installation_en_route", "installation_in_progress"]);

const LA_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function laParts(at: Date) {
  return Object.fromEntries(LA_PARTS.formatToParts(at).map((part) => [part.type, Number(part.value)])) as Record<string, number>;
}

/** Los Angeles UTC offset (ms) in effect at a given instant. */
function laOffset(at: Date) {
  const p = laParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Midnight in Los Angeles as a UTC instant — the server may run in UTC.
 * The offset is taken at midnight itself, not at `now`: on DST switch days
 * the two differ by an hour.
 */
export function startOfLaDay(now: Date) {
  const p = laParts(now);
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day);
  const guess = wallMidnight - laOffset(now);
  return new Date(wallMidnight - laOffset(new Date(guess)));
}

const byRecent = (a: OpsCard, b: OpsCard) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

export function summarizeLegacyOrders(payload: unknown, now = new Date(), cardsPerStage = 6): OpsSummary {
  const data = (payload && typeof payload === "object" ? payload : {}) as Row;
  const orders: Row[] = (Array.isArray(data.orders) ? data.orders : []).filter(
    (order: Row) => order && typeof order === "object" && !isHistoricalDraft(order),
  );
  const clients = new Map<string, string>(
    (Array.isArray(data.clients) ? data.clients : [])
      .filter((client: Row) => client?.id)
      .map((client: Row) => [String(client.id), String(client.name ?? client.company ?? "").trim() || "Клиент без имени"]),
  );

  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const startOfToday = startOfLaDay(now);

  let receivable = 0;
  let received30 = 0;
  let withoutEstimate = 0;
  const debtors: OpsCard[] = [];
  const installs: OpsCard[] = [];
  const stageCards = new Map<OpsStageKey, OpsCard[]>(OPS_STAGES.map((stage) => [stage.key, []]));

  for (const order of orders) {
    const status = String(order.status ?? "");
    for (const payment of Array.isArray(order.payments) ? order.payments : []) {
      const date = validDate(payment?.date ?? payment?.recordedAt);
      if (date && date >= since30 && date <= now) received30 += num(payment?.amount);
    }
    const stripe = unrecordedStripe(order);
    if (stripe?.at && stripe.at >= since30 && stripe.at <= now) received30 += stripe.amount;
    // Older orders: only a total in `o.paid` with its date, no itemized lines.
    if (!(Array.isArray(order.payments) && order.payments.length) && !stripe && num(order.paid) > 0) {
      const paidAt = validDate(order.paidAt);
      if (paidAt && paidAt >= since30 && paidAt <= now) received30 += num(order.paid);
    }
    if (LOST_STATUSES.has(status)) continue;

    const card = toCard(order, clients);
    if (OWED_FROM.has(status)) {
      if (card.balance === null) withoutEstimate += 1;
      else if (card.balance > 0.5) {
        receivable += card.balance;
        debtors.push(card);
      }
    }
    if (DONE_STATUSES.has(status)) continue;

    const stage = OPS_STAGES.find((item) => item.statuses.includes(status)) ?? OPS_STAGES[0];
    stageCards.get(stage.key)!.push(card);
    const next = INSTALL_LISTED.has(status) ? upcomingInstall(order, startOfToday, in7) : null;
    if (next) installs.push({ ...card, installAt: next.toISOString() });
  }

  const stages = OPS_STAGES.map((stage) => {
    const cards = stageCards.get(stage.key)!.sort(byRecent);
    return { key: stage.key, title: stage.title, count: cards.length, cards: cards.slice(0, cardsPerStage) };
  });

  return {
    active: stages.reduce((sum, stage) => sum + stage.count, 0),
    installsNext7: installs.sort((a, b) => (a.installAt ?? "").localeCompare(b.installAt ?? "")),
    receivable: Math.round(receivable),
    receivableCount: debtors.length,
    withoutEstimate,
    received30: Math.round(received30),
    stages,
    debtors: debtors.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0)).slice(0, 8),
  };
}

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
