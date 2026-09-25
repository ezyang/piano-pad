// Service worker: network-first for the app's own files, so a home-screen
// install always picks up the latest deploy (GitHub Pages sends
// max-age=600, and iOS standalone apps hold on to cached copies), with the
// last good copy as an offline fallback.
const CACHE = 'pianopad';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      // 'no-cache' revalidates with the server instead of trusting max-age.
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
