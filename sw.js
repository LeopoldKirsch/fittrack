// Service worker: makes the app load instantly and work offline.
// Bump VERSION on every deploy.
const VERSION = 'fittrack-v1.0.4';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/sync.js',
  './js/calc.js',
  './js/charts.js',
  './js/off.js',
  './js/scanner.js',
  './js/data-foods.js',
  './js/data-exercises.js',
  './js/views/training.js',
  './js/views/nutrition.js',
  './js/views/body.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'fittrack-cdn').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: serve from cache immediately, refresh the cache in the background.
  if (url.origin === location.origin) {
    const key = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(key, { ignoreSearch: true });
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Pinned CDN libraries (Supabase client, barcode scanner): cache forever.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open('fittrack-cdn').then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
  // Everything else (Supabase API, Open Food Facts) goes straight to the network.
});
