// Winter Watch field app: offline support. Keeps the field app and its code on the phone so it opens
// with no signal. Visit data itself lives in IndexedDB (see fieldStore.ts), never in this cache.
const VERSION = 'ww-field-v1';
const SHELL = ['/field', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png'];

async function precacheShell() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL);
  // Also keep every script and stylesheet the field page loads, so the first offline launch works.
  try {
    const html = await (await cache.match('/field')).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => {})));
  } catch (e) { /* the page will be cached again on its next load */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Code files never change at the same address: keep them forever.
  if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // The field app page: open instantly from the phone, refresh it in the background when there is signal.
  if (url.origin === location.origin && (url.pathname === '/field' || url.pathname === '/field/') && req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match('/field');
      const net = fetch(req).then((res) => {
        if (res.ok) {
          c.put('/field', res.clone());
          res.clone().text().then((html) => {
            const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
            assets.forEach((a) => c.match(a).then((h) => h || c.add(a).catch(() => {})));
          });
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Fonts: use the saved copy, refresh when possible.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else (the office app, /api, photos) goes straight to the network.
});
