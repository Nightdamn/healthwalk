// InStep service worker — minimal, install-only.
//
// Purpose:
//   1. Make the site installable as a PWA on Android Chrome + iOS Safari.
//      (browsers require a registered SW with a fetch handler before the
//      "Add to Home Screen" / install prompt becomes available).
//   2. Cache the app shell (icons + manifest) so the homescreen icon and
//      offline launch screen don't flash blank on cold start.
//
// What this does NOT do (intentionally):
//   - It does not cache API calls, video, or app JS/CSS. They're served
//     from the same origin and Vite already gives them fingerprinted
//     filenames with immutable cache headers (handled in nginx). Caching
//     them in the SW would just risk serving stale code after deploy.
//   - It does not serve a custom offline page. The app is online-first.
//
// Bumping CACHE_VERSION forces all clients to flush the cache on next visit.
const CACHE_VERSION = 'instep-shell-v1';
const SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin static shell URLs from cache; everything else
  // (API, videos, hashed bundle chunks) goes straight to network as usual.
  if (url.origin !== self.location.origin) return;
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
      }
      return res;
    }))
  );
});
