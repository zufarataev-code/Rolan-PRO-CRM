/**
 * Центр управления RolanPRO: реестр сервисов и проектов + сведение живых
 * проверок в понятный статус. Здесь только названия, ссылки, ответственные и
 * статусы — никаких паролей, токенов и ключей (решение владельца, авг 2026).
 */

export type ServiceStatus = "ok" | "warn" | "down" | "unknown";

export type CheckResult = {
  status: ServiceStatus;
  detail: string;
};

export type ServiceGroup = "core" | "leads" | "comms" | "money" | "marketing" | "sites";

export type ServiceEntry = {
  id: string;
  name: string;
  group: ServiceGroup;
  purpose: string;
  owner: string;
  link?: string;
  cost?: string;
  /** Key of the live check in control-center.ts; absent = manual entry. */
  check?: string;
  /** Status for services without a live check. */
  manual?: CheckResult;
};

export const GROUP_TITLES: Record<ServiceGroup, string> = {
  core: "Ядро: сервер, база, CRM",
  leads: "Лиды и бот",
  comms: "Связь с клиентами",
  money: "Деньги",
  marketing: "Реклама и контент",
  sites: "Сайты и домены",
};

export const SERVICES: ServiceEntry[] = [
  { id: "server", name: "Сервер CRM", group: "core", purpose: "DigitalOcean + RunCloud, на нём CRM и база", owner: "Зуфар", link: "https://cloud.digitalocean.com/", check: "server" },
  { id: "database", name: "База данных PostgreSQL", group: "core", purpose: "Главное хранилище: лиды, проекты, деньги", owner: "Зуфар", check: "database" },
  { id: "release", name: "Версия CRM", group: "core", purpose: "Что сейчас выкачено из GitHub main", owner: "Зуфар", link: "https://github.com/zufarataev-code/Rolan-PRO-CRM", check: "release" },
  { id: "backups", name: "Резервные копии базы", group: "core", purpose: "Возможность откатиться после сбоя", owner: "Зуфар", link: "https://cloud.digitalocean.com/", manual: { status: "warn", detail: "Автоматических копий нет — DigitalOcean об этом предупреждает" } },
  { id: "files", name: "Хранилище фото и видео", group: "core", purpose: "Фото и видео с замеров и объектов", owner: "Зуфар", manual: { status: "down", detail: "Фото лежат внутри данных заказа, лимит 2 МБ, видео загрузить нельзя. План: DigitalOcean Spaces" } },

  { id: "meta-leads", name: "Лиды из рекламных форм Meta", group: "leads", purpose: "Заявки из Facebook/Instagram сразу в «Новые лиды»", owner: "Данил", link: "https://business.facebook.com/", check: "metaLeads" },
  { id: "messenger-bot", name: "Бот в Messenger", group: "leads", purpose: "Отвечает в чате, записывает на замер", owner: "Зуфар", link: "https://dash.cloudflare.com/", check: "messengerBot" },
  { id: "welcome-sms", name: "SMS «спасибо за интерес»", group: "leads", purpose: "Первое касание нового лида, ночью — вопрос о времени звонка", owner: "Данил", check: "welcomeSms" },

  { id: "twilio", name: "Twilio SMS", group: "comms", purpose: "SMS клиентам: подтверждения, напоминания", owner: "Зуфар", link: "https://console.twilio.com/", check: "twilio" },
  { id: "gmail", name: "Gmail info@rolan-pro.com", group: "comms", purpose: "КП и переписка с клиентами", owner: "Данил", link: "https://mail.google.com/", check: "gmail" },
  { id: "zadarma", name: "Телефония Zadarma", group: "comms", purpose: "Звонки и записи разговоров", owner: "Данил", link: "https://my.zadarma.com/", check: "zadarma" },
  { id: "marketing-email", name: "Рассылки", group: "comms", purpose: "Отзывы и письма клиентам", owner: "Зуфар", check: "marketingEmail" },

  { id: "stripe", name: "Stripe", group: "money", purpose: "Оплата картой по КП", owner: "Зуфар", link: "https://dashboard.stripe.com/", check: "stripe" },
  { id: "zelle", name: "Zelle / банковский перевод", group: "money", purpose: "Реквизиты в КП клиента", owner: "Зуфар", check: "zelle" },

  { id: "google-ads", name: "Google Ads", group: "marketing", purpose: "Реклама и передача конверсий", owner: "Зуфар", link: "https://ads.google.com/", check: "googleAds" },
  { id: "meta-ads", name: "Meta Ads Manager", group: "marketing", purpose: "Реклама в Facebook/Instagram", owner: "Зуфар", link: "https://adsmanager.facebook.com/", manual: { status: "unknown", detail: "Статус кампаний смотреть в Ads Manager" } },
  { id: "ai", name: "ИИ (Anthropic / OpenAI)", group: "marketing", purpose: "Бот, генерация текстов, голосовой замер", owner: "Зуфар", check: "ai" },

  { id: "site", name: "Сайт rolan-pro.com", group: "sites", purpose: "Сайт услуг для США", owner: "Зуфар", link: "https://rolan-pro.com/", check: "siteMain" },
  { id: "legal", name: "Правовые страницы", group: "sites", purpose: "Политика конфиденциальности для Meta", owner: "Зуфар", link: "https://rolanpro-legal.netlify.app/privacy-policy/", check: "siteLegal" },
  { id: "domain", name: "Домен rolan-pro.com", group: "sites", purpose: "Регистратор Webnames.ru, почта и сайт", owner: "Зуфар", link: "https://www.webnames.ru/my/account", manual: { status: "unknown", detail: "Проверять дату продления у регистратора" } },
];

export type ProjectEntry = { name: string; state: "active" | "paused" | "planned"; note: string; link?: string };

export const PROJECTS: ProjectEntry[] = [
  { name: "CRM / ERP RolanPRO", state: "active", note: "Единый портал: лиды, проекты, касса, склад, деньги", link: "/legacy-crm" },
  { name: "Бот-продажник", state: "active", note: "Messenger → запись на замер → CRM" },
  { name: "Реклама и контент-завод", state: "active", note: "Meta/Google Ads, ролики, группы FB" },
  { name: "Каталог и брендбук", state: "active", note: "ROLANPRO PRIME, упаковка, образцы" },
  { name: "Хранилище файлов", state: "planned", note: "Фото и видео без лимита 2 МБ" },
  { name: "Приложение смарт-плёнки", state: "planned", note: "Управление PDLC через Alexa/Google/Apple" },
  { name: "Интернет-магазин США", state: "planned", note: "Shopify, товары и плёнка" },
  { name: "CRM Москва и сайт РФ", state: "paused", note: "Отложено решением владельца" },
];

const RANK: Record<ServiceStatus, number> = { down: 0, warn: 1, unknown: 2, ok: 3 };

export function summarizeStatuses(statuses: ServiceStatus[]) {
  const counts = { ok: 0, warn: 0, down: 0, unknown: 0 } as Record<ServiceStatus, number>;
  for (const status of statuses) counts[status] += 1;
  const worst = statuses.reduce<ServiceStatus>((acc, status) => (RANK[status] < RANK[acc] ? status : acc), "ok");
  return { counts, worst };
}

export function sortByUrgency<T extends { result: CheckResult }>(items: T[]) {
  return [...items].sort((a, b) => RANK[a.result.status] - RANK[b.result.status]);
}

export function relativeAge(date: Date | null | undefined, now = new Date()) {
  if (!date) return "ни разу";
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

/** Server pressure → status. Thresholds chosen so a warning means "act this week". */
export function serverStatus(input: { diskUsedPct: number; memUsedPct: number; loadPerCpu: number }): ServiceStatus {
  if (input.diskUsedPct >= 95 || input.memUsedPct >= 97) return "down";
  if (input.diskUsedPct >= 85 || input.memUsedPct >= 90 || input.loadPerCpu >= 1.5) return "warn";
  return "ok";
}

export function envStatus(configured: boolean, label: string): CheckResult {
  return configured
    ? { status: "ok", detail: `${label}: подключено` }
    : { status: "down", detail: `${label}: не настроено на сервере` };
}
