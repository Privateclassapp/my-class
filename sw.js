/* sw.js — offline cache for the app shell. */
const VERSION = 'my-class-v2.1.0';
const CACHE_NAME = VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './jalaali-vendor.js',
  './jalali.js',
  './i18n.js',
  './format.js',
  './crypto.js',
  './db.js',
  './billing.js',
  './config.js',
  './api.js',
  './auth.js',
  './portal.js',
  './sync.js',
  './ui.js',
  './pages-students.js',
  './pages-classes.js',
  './pages-attendance.js',
  './pages-money.js',
  './accounts.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './Vazirmatn-Variable.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'sw-updated', version: VERSION })))
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/student/') >= 0) return;

  if (request.mode === 'navigate') {
    const indexUrl = new URL('./index.html', self.location.href).href;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(indexUrl).then((cached) => cached || caches.match(new URL('./', self.location.href).href))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => null);
      return cached || network.then((response) => response ||
        new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
    })
  );
});
