import { statfs } from "node:fs/promises";
import os from "node:os";

import { getTwilioConfig } from "@/features/twilio/service";
import { prisma } from "@/lib/db";
import { getSpacesConfig, presignUrl } from "@/lib/storage/spaces";

import {
  envStatus,
  relativeAge,
  serverStatus,
  SERVICES,
  type CheckResult,
  type ServiceEntry,
} from "./control-center-core";
import { summarizeLegacyOrders, type OpsSummary } from "./control-center-ops";

const CHECK_TIMEOUT_MS = 5000;
const CACHE_MS = 30_000;
const BOT_URL = "https://rolanpro-bot.lingering-bread-9b47.workers.dev/";

const env = (name: string) => Boolean(process.env[name]?.trim());

function withTimeout<T>(promise: Promise<T>, ms = CHECK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function pingUrl(url: string, okStatuses: number[] = [200, 301, 302, 304]): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const ms = Date.now() - startedAt;
    if (!okStatuses.includes(response.status)) {
      return { status: "down", detail: `Отвечает с ошибкой ${response.status}` };
    }
    return { status: ms > 3000 ? "warn" : "ok", detail: `Отвечает за ${ms} мс` };
  } catch {
    return { status: "down", detail: "Не отвечает" };
  }
}

const CHECKS: Record<string, () => Promise<CheckResult>> = {
  async server() {
    const disk = await statfs("/");
    const diskUsedPct = Math.round((1 - disk.bavail / disk.blocks) * 100);
    const memUsedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);
    const cpus = os.cpus().length || 1;
    const loadPerCpu = os.loadavg()[0] / cpus;
    const totalGb = (os.totalmem() / 1024 ** 3).toFixed(1);
    const freeDiskGb = ((disk.bavail * disk.bsize) / 1024 ** 3).toFixed(0);
    return {
      status: serverStatus({ diskUsedPct, memUsedPct, loadPerCpu }),
      detail: `Диск занят ${diskUsedPct}% (свободно ${freeDiskGb} ГБ) · память ${memUsedPct}% из ${totalGb} ГБ · нагрузка ${loadPerCpu.toFixed(2)} на ядро (${cpus} ядра) · работает ${Math.round(os.uptime() / 3600)} ч`,
    };
  },

  async database() {
    const startedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - startedAt;
    const leads = await prisma.lead.count();
    return { status: ms > 500 ? "warn" : "ok", detail: `Отвечает за ${ms} мс · лидов в базе: ${leads}` };
  },

  async release() {
    const sha = process.env.ROLANPRO_RELEASE_SHA?.trim();
    return sha
      ? { status: "ok", detail: `Выкачен коммит ${sha.slice(0, 7)}` }
      : { status: "unknown", detail: "Сервер не сообщает версию" };
  },

  async metaLeads() {
    const configured = ["META_LEAD_ADS_APP_SECRET", "META_LEAD_ADS_PAGE_ACCESS_TOKEN", "META_LEAD_ADS_PAGE_ID", "META_LEAD_ADS_VERIFY_TOKEN"].every(env);
    if (!configured) return { status: "down", detail: "Приём заявок из форм не настроен на сервере" };
    const last = await prisma.lead.findFirst({
      where: { source: "meta_lead_ads" },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    });
    const week = await prisma.lead.count({
      where: { source: "meta_lead_ads", created_at: { gte: new Date(Date.now() - 7 * 864e5) } },
    });
    return { status: "ok", detail: `Последняя заявка: ${relativeAge(last?.created_at)} · за 7 дней: ${week}` };
  },

  async messengerBot() {
    if (!env("FACEBOOK_MESSENGER_SHARED_SECRET")) {
      return { status: "down", detail: "Связь бота с CRM не настроена" };
    }
    // Without the verify token the worker must answer 403 — that proves it is alive.
    const ping = await pingUrl(BOT_URL, [403]);
    const last = await prisma.lead.findFirst({
      where: { source: "facebook_messenger" },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    });
    if (ping.status === "down") return { status: "down", detail: "Воркер бота не отвечает" };
    return { status: "ok", detail: `Бот на связи · последний лид из чата: ${relativeAge(last?.created_at)}` };
  },

  async welcomeSms() {
    if (process.env.LEAD_WELCOME_SMS_ENABLED === "false") return { status: "warn", detail: "Выключено настройкой" };
    const [sent, failed] = await Promise.all([
      prisma.activityLog.findFirst({ where: { action_key: "lead.welcome_sms" }, orderBy: { created_at: "desc" }, select: { created_at: true } }),
      prisma.activityLog.findFirst({ where: { action_key: "lead.welcome_sms_failed" }, orderBy: { created_at: "desc" }, select: { created_at: true, metadata: true } }),
    ]);
    if (failed && (!sent || failed.created_at > sent.created_at)) {
      const error = (failed.metadata as { error?: string } | null)?.error || "ошибка Twilio";
      return { status: "down", detail: `Последнее SMS не ушло (${relativeAge(failed.created_at)}): ${error}` };
    }
    return sent
      ? { status: "ok", detail: `Последнее SMS: ${relativeAge(sent.created_at)}` }
      : { status: "unknown", detail: "Ещё не было новых лидов с телефоном" };
  },

  async plaud() {
    if (!process.env.PLAUD_WEBHOOK_SECRET?.trim()) return { status: "warn", detail: "Не подключён: нужен PLAUD_WEBHOOK_SECRET и Zap в Zapier" };
    const last = await prisma.activityLog.findFirst({ where: { action_key: "integration.plaud.recording" }, orderBy: { created_at: "desc" }, select: { created_at: true } });
    return last ? { status: "ok", detail: `Последняя запись: ${relativeAge(last.created_at)}` } : { status: "unknown", detail: "Подключено, записей ещё не было" };
  },

  async twilio() {
    if (!getTwilioConfig().ready) return { status: "down", detail: "Twilio не настроен на сервере" };
    const since = new Date(Date.now() - 7 * 864e5);
    const [total, failed] = await Promise.all([
      prisma.twilioMessage.count({ where: { direction: "out", sent_at: { gte: since } } }),
      prisma.twilioMessage.count({ where: { direction: "out", sent_at: { gte: since }, status: { in: ["failed", "undelivered"] } } }),
    ]);
    if (total === 0) return { status: "unknown", detail: "За 7 дней SMS не отправлялись" };
    const share = Math.round((failed / total) * 100);
    return {
      status: share >= 50 ? "down" : share > 10 ? "warn" : "ok",
      detail: `За 7 дней отправлено ${total}, не доставлено ${failed} (${share}%)`,
    };
  },

  async gmail() {
    const connection = await prisma.gmailConnection.findFirst({
      where: { is_active: true },
      select: { email_address: true, last_synced_at: true, sync_error: true },
    });
    if (!connection) return { status: "down", detail: "Почта не подключена к CRM" };
    if (connection.sync_error) return { status: "warn", detail: `${connection.email_address}: ошибка синхронизации` };
    return { status: "ok", detail: `${connection.email_address} · синхронизация ${relativeAge(connection.last_synced_at)}` };
  },

  async zadarma() {
    return envStatus(env("ZADARMA_API_KEY") && env("ZADARMA_API_SECRET"), "Zadarma API");
  },
  async marketingEmail() {
    return envStatus(env("MARKETING_EMAIL_API_KEY") && process.env.MARKETING_EMAIL_ENABLED !== "false", "Рассылки");
  },
  async stripe() {
    return envStatus(env("STRIPE_SECRET_KEY"), "Stripe");
  },
  async zelle() {
    return envStatus(env("ROLANPRO_ZELLE_RECIPIENT"), "Реквизиты Zelle");
  },
  async googleAds() {
    return envStatus(env("GOOGLE_ADS_DEVELOPER_TOKEN") && (env("GOOGLE_ADS_OAUTH_REFRESH_TOKEN") || env("GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY")), "Google Ads API");
  },
  async ai() {
    const anthropic = env("ANTHROPIC_API_KEY");
    const openai = env("OPENAI_API_KEY");
    if (anthropic && openai) return { status: "ok", detail: "Anthropic и OpenAI подключены" };
    if (anthropic || openai) return { status: "warn", detail: `Подключён только ${anthropic ? "Anthropic" : "OpenAI"}` };
    return { status: "down", detail: "Ключи ИИ не настроены" };
  },
  async files() {
    const config = getSpacesConfig();
    if (!config) return { status: "down", detail: "Хранилище rolanpro-media создано, но ключи доступа ещё не вписаны на сервер — фото пока идут по-старому (до 2 МБ)" };
    // A missing object answers 404 when the keys are valid, 403 when they are not.
    const probe = presignUrl({ config, method: "HEAD", key: "crm/health/0000-00/probe", expiresSeconds: 60 });
    const response = await fetch(probe, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (response.status === 403) return { status: "down", detail: "Ключи хранилища отклонены (403)" };
    return { status: "ok", detail: `Бакет ${config.bucket} (${config.region}) на связи — оригиналы без сжатия` };
  },
  siteMain: () => pingUrl("https://rolan-pro.com/"),
  siteLegal: () => pingUrl("https://rolanpro-legal.netlify.app/privacy-policy/"),
};

export type ControlCenterService = ServiceEntry & { result: CheckResult };

let cache: { at: number; services: ControlCenterService[] } | null = null;

export async function getControlCenterSnapshot(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return { checkedAt: new Date(cache.at), services: cache.services };
  const services = await Promise.all(
    SERVICES.map(async (service): Promise<ControlCenterService> => {
      if (!service.check) return { ...service, result: service.manual ?? { status: "unknown", detail: "Ручная запись" } };
      const run = CHECKS[service.check];
      if (!run) return { ...service, result: { status: "unknown", detail: "Проверка не найдена" } };
      try {
        return { ...service, result: await withTimeout(run()) };
      } catch (error) {
        const message = error instanceof Error && error.message === "timeout" ? "Проверка не уложилась в 5 с" : "Проверка упала";
        return { ...service, result: { status: "down", detail: message } };
      }
    }),
  );
  cache = { at: Date.now(), services };
  return { checkedAt: new Date(cache.at), services };
}

export const CONTROL_CENTER_CHECK_KEYS = Object.keys(CHECKS);

const OPS_CACHE_MS = 60_000;
let opsCache: { at: number; ops: OpsSummary } | null = null;

/**
 * Projects and money from the working CRM. Reads only the two keys it needs
 * (orders, clients) straight from Postgres JSON, at most once a minute, so the
 * page never loads the whole legacy workspace on every refresh.
 */
export type ControlCenterOps =
  | { ok: true; ops: OpsSummary; asOf: Date; staleError?: string }
  | { ok: false; error: string };

export async function getControlCenterOps(): Promise<ControlCenterOps> {
  if (opsCache && Date.now() - opsCache.at < OPS_CACHE_MS) return { ok: true, ops: opsCache.ops, asOf: new Date(opsCache.at) };
  try {
    type OpsRow = { orders: unknown; clients: unknown };
    const rows = (await withTimeout(
      prisma.$queryRaw<OpsRow[]>`
        SELECT payload->'orders' AS orders, payload->'clients' AS clients
        FROM legacy_workspaces WHERE workspace_id = 'primary' LIMIT 1`,
    )) as OpsRow[];
    // No workspace row is a broken CRM, not an empty business.
    if (!rows[0]) throw new Error("workspace_not_initialized");
    const ops = summarizeLegacyOrders({ orders: rows[0].orders ?? [], clients: rows[0].clients ?? [] });
    opsCache = { at: Date.now(), ops };
    return { ok: true, ops, asOf: new Date(opsCache.at) };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message =
      code === "timeout" ? "База не ответила за 5 с" : code === "workspace_not_initialized" ? "Рабочая CRM не найдена в базе" : "Не удалось прочитать проекты";
    // Keep the last numbers on screen, but never present them as live.
    if (opsCache) return { ok: true, ops: opsCache.ops, asOf: new Date(opsCache.at), staleError: message };
    return { ok: false, error: message };
  }
}
