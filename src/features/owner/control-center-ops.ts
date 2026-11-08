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

function paidTotal(order: Row) {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  return payments.length ? payments.reduce((sum: number, payment: Row) => sum + num(payment?.amount), 0) : num(order.paid);
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

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
    const installAt = validDate(order.installationAt);
    if (installAt && installAt >= startOfToday && installAt <= in7) installs.push(card);
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
