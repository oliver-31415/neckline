/* Neckline service worker: offline cache + check-in reminder notifications.
   It never sends your diary anywhere — it only caches the app's own files. */
const VERSION = '__VERSION__';
const CACHE = 'neckline-' + VERSION;
const PRECACHE = __PRECACHE__;
const KEEP = 2; // keep the previous version too, so a page that's already open can still load its chunks

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 'reload' skips the browser's HTTP cache so we never store a stale index.html
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const ours = keys.filter((k) => k.startsWith('neckline-'));
      const old = ours.filter((k) => k !== CACHE).slice(0, Math.max(0, ours.length - KEEP));
      return Promise.all(old.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page itself, so a new deploy is picked up straight away; cache when offline.
    event.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./', { cacheName: CACHE }).then((r) => r || caches.match('./', { ignoreSearch: true }))),
    );
    return;
  }
  // Hashed assets never change, so cache first (any version), then network.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
      if (res.ok && url.pathname.includes('/assets/')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain text payload */ }
  const title = data.title || 'Neck check-in';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'How is your neck right now?',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'neckline-checkin',
      data: { slot: data.slot || null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const slot = event.notification.data && event.notification.data.slot;
  const target = new URL('./#/checkin' + (slot ? '?slot=' + slot : ''), self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.postMessage({ type: 'open-checkin', slot });
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
