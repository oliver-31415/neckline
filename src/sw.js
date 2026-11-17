/* Neckline service worker: offline cache + check-in reminder notifications.
   It never sends your diary anywhere — it only caches the app's own files. */
const VERSION = '__VERSION__';
const CACHE = 'neckline-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('neckline-') && k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
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
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain text payload */ }
  const title = data.title || 'Neck check-in';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'How is your neck right now? A quick check-in takes about 20 seconds.',
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
  const target = new URL('./#/today?checkin=' + (slot || 'now'), self.registration.scope).href;
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
