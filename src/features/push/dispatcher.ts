import { prisma } from "@/lib/db";

import { pushConfig } from "./config";
import { clip, legacyPushEvents, newLeadEvents, PG_PUSH_TYPES, pgNotificationEvents, textForRecipient, type PushEvent } from "./events";
import { sendWebPush, type PushSendResult, type VapidKeys } from "./web-push";

/**
 * Pushes leave the server from one queue (push_deliveries): one row per event
 * and employee, so a retry or a repeated save never sends twice. Errors here
 * never reach the action that caused the push.
 */

const MAX_ATTEMPTS = 3;
/** Rows and sources older than this are not news any more. */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** How far back each cycle looks for new leads and notifications. */
const SCAN_WINDOW_MS = 15 * 60 * 1000;
const KEEP_DAYS = 30;
/** A subscription that failed this many times in a row is dropped. */
const MAX_FAILS = 10;

async function activeUsersWithRole(code: "OWNER" | "MANAGER") {
  const rows = await prisma.user.findMany({
    where: { is_active: true, user_accesses: { some: { is_active: true, role: { code, is_active: true } } } },
    select: { user_id: true },
  });
  return rows.map((row) => row.user_id);
}

export async function rolesByUser(userIds: string[]) {
  if (!userIds.length) return new Map<string, string[]>();
  const rows = await prisma.userAccess.findMany({
    where: { user_id: { in: userIds }, is_active: true, role: { is_active: true } },
    select: { user_id: true, role: { select: { code: true } } },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.role.code]);
  return map;
}

/** Queues pushes for the people among the recipients who have a device turned on. */
export async function queuePushEvents(events: PushEvent[]) {
  if (!pushConfig() || !events.length) return 0;
  const recipients = [...new Set(events.flatMap((event) => event.recipients))];
  if (!recipients.length) return 0;
  const [withDevice, roles] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { user_id: { in: recipients } }, select: { user_id: true }, distinct: ["user_id"] }),
    rolesByUser(recipients),
  ]);
  const ready = new Set(withDevice.map((row) => row.user_id));
  const data = events.flatMap((event) =>
    event.recipients
      .filter((userId) => ready.has(userId))
      .map((userId) => {
        const text = textForRecipient(roles.get(userId) ?? [], event);
        return {
          event_key: clip(event.key, 240),
          recipient_user_id: userId,
          kind: event.kind,
          title: clip(text.title, 120),
          body: clip(text.body, 300),
          url: event.url.startsWith("/") ? clip(event.url, 300) : "/",
        };
      }),
  );
  if (!data.length) return 0;
  const result = await prisma.pushDelivery.createMany({ data, skipDuplicates: true });
  return result.count;
}

/** Rows are read in pages so a busy quarter hour is never cut short. */
const PAGE_SIZE = 200;
/** A runaway (a bulk import) stops here; skipDuplicates keeps later cycles safe. */
const MAX_PAGES = 25;

type Page<T> = (cursor: string | null) => Promise<T[]>;

export async function readAllPages<T>(page: Page<T>, idOf: (row: T) => string, pageSize = PAGE_SIZE, maxPages = MAX_PAGES) {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < maxPages; index += 1) {
    const rows = await page(cursor);
    out.push(...rows);
    if (rows.length < pageSize) break;
    cursor = idOf(rows[rows.length - 1]);
  }
  return out;
}

/** New leads and the new CRM's notifications of the pushed kinds since the last look. */
async function queuePostgresSources(now: Date) {
  const since = new Date(now.getTime() - SCAN_WINDOW_MS);
  const [notifications, leads, owners] = await Promise.all([
    readAllPages(
      (cursor) =>
        prisma.notification.findMany({
          where: { created_at: { gte: since }, type_key: { in: PG_PUSH_TYPES } },
          select: { notification_id: true, recipient_user_id: true, actor_user_id: true, type_key: true, title: true, message: true, entity_type: true },
          orderBy: { notification_id: "asc" },
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { notification_id: cursor }, skip: 1 } : {}),
        }),
      (row) => row.notification_id,
    ),
    readAllPages(
      (cursor) =>
        prisma.lead.findMany({
          where: { created_at: { gte: since } },
          select: { lead_id: true, name: true, source: true, assigned_manager_id: true },
          orderBy: { lead_id: "asc" },
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { lead_id: cursor }, skip: 1 } : {}),
        }),
      (row) => row.lead_id,
    ),
    activeUsersWithRole("OWNER"),
  ]);
  const managers = leads.some((lead) => !lead.assigned_manager_id) ? await activeUsersWithRole("MANAGER") : [];
  const events = [...pgNotificationEvents(notifications, owners), ...newLeadEvents(leads, owners, managers)];
  // createMany has its own limits: queue in slices.
  for (let index = 0; index < events.length; index += PAGE_SIZE) await queuePushEvents(events.slice(index, index + PAGE_SIZE));
}

export type DeliveryOutcome = { status: "sent" | "queued" | "failed" | "no_device"; error?: string };

/** What one delivery row becomes after one try on every device of its employee. */
export function deliveryOutcome(results: PushSendResult[], attempts: number): DeliveryOutcome {
  if (!results.length) return { status: "no_device" };
  if (results.some((result) => result.ok)) return { status: "sent" };
  const error = results.find((result) => result.error)?.error ?? "failed";
  if (results.every((result) => result.gone)) return { status: "no_device", error };
  return attempts >= MAX_ATTEMPTS ? { status: "failed", error } : { status: "queued", error };
}

export async function sendToUser(
  userId: string,
  message: { title: string; body: string; url: string; tag: string },
  keys: VapidKeys,
) {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
  const results: PushSendResult[] = [];
  for (const subscription of subscriptions) {
    const result = await sendWebPush(subscription, message, keys);
    results.push(result);
    if (result.ok) {
      await prisma.pushSubscription.update({ where: { push_subscription_id: subscription.push_subscription_id }, data: { last_success_at: new Date(), fail_count: 0 } });
    } else if (result.gone || subscription.fail_count + 1 >= MAX_FAILS) {
      await prisma.pushSubscription.deleteMany({ where: { push_subscription_id: subscription.push_subscription_id } });
    } else {
      await prisma.pushSubscription.update({ where: { push_subscription_id: subscription.push_subscription_id }, data: { fail_count: { increment: 1 } } });
    }
  }
  return results;
}

async function deliverQueued(keys: VapidKeys, now: Date) {
  const rows = await prisma.pushDelivery.findMany({
    where: { status: "queued", created_at: { gte: new Date(now.getTime() - FRESH_MS) } },
    orderBy: { created_at: "asc" },
    take: 50,
  });
  for (const row of rows) {
    const attempts = row.attempts + 1;
    const results = await sendToUser(row.recipient_user_id, { title: row.title, body: row.body, url: row.url, tag: row.event_key }, keys);
    const outcome = deliveryOutcome(results, attempts);
    await prisma.pushDelivery.update({
      where: { push_delivery_id: row.push_delivery_id },
      data: { status: outcome.status, attempts, last_error: outcome.error ? clip(outcome.error, 120) : null, sent_at: outcome.status === "sent" ? new Date() : null },
    });
  }
  return rows.length;
}

let running = false;
let lastCleanup = 0;

export async function runPushCycle(now = new Date()) {
  const keys = pushConfig();
  if (!keys || running) return { skipped: true };
  running = true;
  try {
    // Nobody has a device turned on yet: nothing to look at.
    if (!(await prisma.pushSubscription.count())) return { skipped: false, sent: 0 };
    await queuePostgresSources(now).catch((error) => console.error("[push] scan failed", error instanceof Error ? error.message : error));
    const sent = await deliverQueued(keys, now);
    if (now.getTime() - lastCleanup > 60 * 60 * 1000) {
      lastCleanup = now.getTime();
      await prisma.pushDelivery.deleteMany({ where: { created_at: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000) } } });
    }
    return { skipped: false, sent };
  } finally {
    running = false;
  }
}

let kickTimer: ReturnType<typeof setTimeout> | null = null;

/** Runs a cycle shortly after a save, so a push does not wait for the next tick. */
export function kickPushCycle(delayMs = 1500) {
  if (!pushConfig() || kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    runPushCycle().catch((error) => console.error("[push] cycle failed", error instanceof Error ? error.message : error));
  }, delayMs);
  kickTimer.unref?.();
}

/** Started once per server process from instrumentation.ts. */
export function startPushScheduler() {
  const holder = globalThis as unknown as Record<string, unknown>;
  if (holder.__rolanproPushCycle || !pushConfig()) return;
  holder.__rolanproPushCycle = setInterval(() => {
    runPushCycle().catch((error) => console.error("[push] cycle failed", error instanceof Error ? error.message : error));
  }, 30 * 1000);
}

/** Legacy user id → PostgreSQL user id for every active employee. */
async function legacyUserMap() {
  const users = await prisma.user.findMany({ where: { is_active: true, legacy_user_ids: { isEmpty: false } }, select: { user_id: true, legacy_user_ids: true } });
  const map = new Map<string, string>();
  for (const user of users) for (const legacyId of user.legacy_user_ids) map.set(legacyId, user.user_id);
  return map;
}

/**
 * Called after the old CRM saved. Works out the pushes from what changed and
 * queues them. Never throws and is not awaited by the save.
 */
export function pushAfterLegacySave(before: unknown, after: unknown, actorUserId: string) {
  if (!pushConfig()) return;
  void (async () => {
    if (!(await prisma.pushSubscription.count())) return;
    const [map, owners] = await Promise.all([legacyUserMap(), activeUsersWithRole("OWNER")]);
    const events = legacyPushEvents(before, after, {
      userIdForLegacy: (legacyId) => map.get(legacyId) ?? null,
      ownerUserIds: owners,
      actorUserId,
    });
    if (events.length && (await queuePushEvents(events))) kickPushCycle();
  })().catch((error) => console.error("[push] legacy save hook failed", error instanceof Error ? error.message : error));
}
