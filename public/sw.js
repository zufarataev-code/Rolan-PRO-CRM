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
