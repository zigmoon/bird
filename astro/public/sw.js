/* Bird — service worker (PWA local-first) */
/* Toute modification d'un asset versionné doit changer ce nom : sinon les
   visiteurs déjà passés gardent l'ancien fichier, servi en cache-first.
   C'est ce qui laissait l'ancien logo dans la barre haute. */
const CACHE = 'bird-v2.3.1';
const PRECACHE = [
  '/',
  '/editor',
  '/docs',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/assets/bird/css/style.css',
  '/assets/bird/js/fabric.min.js',
  '/assets/bird/js/paper-full.min.js',
  '/assets/bird/js/io.js',
  '/assets/bird/js/app.js',
  '/assets/bird/icons/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations : réseau d'abord, cache en secours (fonctionne hors ligne).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/editor')))
    );
    return;
  }

  // Assets du moteur : cache d'abord, puis réseau et mise en cache à la volée.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      }))
    );
  }
});
