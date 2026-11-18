const VERSION = 'my-class-student-v2.0.0';
const CACHE_NAME = VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './student.css',
  './student.js',
  './manifest.json',
  '../config.js',
  '../api.js',
  '../i18n.js',
  '../format.js',
  '../jalali.js',
  '../jalaali-vendor.js',
  '../Vazirmatn-Variable.woff2',
  '../icon-192.png',
  '../icon-512.png',
  '../icon-maskable-512.png',
  '../apple-touch-icon.png'
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
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

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
