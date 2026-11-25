import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const swSource = readFileSync(resolve("public/sw.js"), "utf8");
const legacyCrm = readFileSync(resolve("private/legacy/rolanpro-crm-cloud.html"), "utf8");
const pushClient = readFileSync(resolve("public/push-client.js"), "utf8");

function loadWorker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const windows: Array<{ url: string; focus: () => Promise<unknown>; navigate: (url: string) => Promise<unknown> }> = [];
  const self = {
    location: { origin: "https://crm.rolanpro.com" },
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler; },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => { opened.push(url); return null; },
      claim: () => undefined,
    },
    skipWaiting: () => undefined,
  };
  vm.runInNewContext(swSource, { self, caches: {}, fetch: () => undefined, URL, Promise });
  return { listeners, shown, opened, windows };
}

async function fire(handler: (event: unknown) => void, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
}

test("a push shows the CRM's notification with its link", async () => {
  const worker = loadWorker();
  await fire(worker.listeners.push, { data: { json: () => ({ title: "Новый лид", body: "Smith · Google Ads", url: "/crm/leads", tag: "pg:lead:1" }) } });
  assert.equal(worker.shown[0].title, "Новый лид");
  assert.equal(worker.shown[0].options.body, "Smith · Google Ads");
  assert.equal(worker.shown[0].options.icon, "/icon-192.png");
  assert.equal(worker.shown[0].options.tag, "pg:lead:1");
  assert.equal(JSON.stringify(worker.shown[0].options.data), JSON.stringify({ url: "/crm/leads" }));
});

test("a push never carries a link to another site", async () => {
  const worker = loadWorker();
  await fire(worker.listeners.push, { data: { json: () => ({ title: "x", url: "https://evil.example/" }) } });
  await fire(worker.listeners.push, { data: { json: () => ({ title: "x", url: "//evil.example/" }) } });
  await fire(worker.listeners.push, { data: { json: () => { throw new Error("not json"); }, text: () => "plain" } });
  assert.deepEqual(worker.shown.map((item) => (item.options.data as { url: string }).url), ["/", "/", "/"]);
  assert.equal(worker.shown[2].title, "RolanPRO");
  assert.equal(worker.shown[2].options.body, "plain");
});

test("tapping a push opens the CRM page, or reuses an open CRM window", async () => {
  const worker = loadWorker();
  let closed = false;
  const notification = { close: () => { closed = true; }, data: { url: "/legacy-crm#/order/o1" } };
  await fire(worker.listeners.notificationclick, { notification });
  assert.equal(closed, true);
  assert.deepEqual(worker.opened, ["https://crm.rolanpro.com/legacy-crm#/order/o1"]);

  const navigated: string[] = [];
  const client = { url: "https://crm.rolanpro.com/crm", focus: async () => client, navigate: async (url: string) => { navigated.push(url); return client; } };
  worker.windows.push(client);
  await fire(worker.listeners.notificationclick, { notification });
  assert.deepEqual(navigated, ["https://crm.rolanpro.com/legacy-crm#/order/o1"]);
  assert.equal(worker.opened.length, 1);
});

test("the service worker still only caches the two brand images", () => {
  assert.match(swSource, /STATIC_ASSETS = \[\s*"\/landing\/rolan-logo\.webp",\s*"\/rolanpro-app-icon\.svg",\s*\]/);
});

test("the old CRM loads the push client and shows the card in 🔔", () => {
  assert.match(legacyCrm, /<script src="\/push-client\.js" defer><\/script>/);
  assert.match(legacyCrm, /function renderNotifications\(\) \{[\s\S]{0,200}\$\{renderPushCard\(\)\}/);
  assert.match(legacyCrm, /Включить уведомления на этом устройстве/);
  assert.match(legacyCrm, /«На экран Домой»/);
  // No card at all until the server has push keys.
  assert.match(legacyCrm, /if \(rpPushStatus === 'unavailable'\) return '';/);
});

test("the push client asks for permission before any network wait", () => {
  const enable = pushClient.slice(pushClient.indexOf("function enable()"), pushClient.indexOf("function disable()"));
  assert.ok(enable.indexOf("Notification.requestPermission()") > -1);
  assert.ok(enable.indexOf("Notification.requestPermission()") < enable.indexOf("loadConfig()"));
  assert.match(pushClient, /userVisibleOnly: true/);
});
