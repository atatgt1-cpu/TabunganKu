const CACHE_NAME = 'tabungansaya-cache-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/storage.js',
  './js/format.js',
  './js/chart.js',
  './js/offline-export.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './img/piggy-hero.jpg',
  './fonts/outfit.ttf',
  './fonts/plus_jakarta_sans.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.ok && networkRes.type === 'basic') {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkRes;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then(
              (fallback) =>
                fallback ||
                new Response('<!doctype html><meta charset="utf-8"><title>TabunganSaya</title><p>Mode offline aktif.</p>', {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' }
                })
            );
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
