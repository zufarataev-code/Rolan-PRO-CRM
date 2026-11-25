// The one service worker of the Rolan PRO CRM, scope "/". It is registered
// from public/pwa-install.js on every staff screen. Push notification handlers
// belong in this file too: a second worker at the same scope would replace
// this one.
const STATIC_CACHE = "rolanpro-static-v2";
const STATIC_ASSETS = [
  "/landing/rolan-logo.webp",
  "/rolanpro-app-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // A missing picture must never stop the worker from installing: without an
  // active worker a phone cannot get push notifications.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => null)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

// CRM data and authenticated pages always remain network-first. Only immutable
// brand assets are cached so an old proposal or order is never shown by mistake.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

// Phone pushes from the CRM (new lead, assigned visit, measurement, accepted
// proposal). The server sends {title, body, url, tag}; nothing else is read.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "RolanPRO";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/";
  const target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((client) => (client && "navigate" in client ? client.navigate(target.href) : null)).catch(() => self.clients.openWindow(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
