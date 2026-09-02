/* Service worker — makes the whole app work with no connection at all.
 * Strategy: precache the shell, then cache-first for everything same-origin.
 * There is no backend, so nothing here ever needs the network after install. */

const VERSION = 'v1.0.0';
const BUILD = '2026-09-01T08-23';   // rewritten by `npm run release`
const CACHE = `cricket-scorer-${VERSION}-${BUILD}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/css/app.css',
  './src/js/app.js',
  './src/js/util.js',
  './src/js/store.js',
  './src/js/engine.js',
  './src/js/stats.js',
  './src/js/fixtures.js',
  './src/js/ui.js',
  './src/js/pwa.js',
  './src/js/theme.js',
  './src/js/balance.js',
  './src/js/share-image.js',
  './src/js/live.js',
  './src/js/qr.js',
  './src/js/vendor/qrcode.js',
  './src/js/vendor/jsqr.js',
  './src/js/views/home.js',
  './src/js/views/matches.js',
  './src/js/views/teams.js',
  './src/js/views/team-detail.js',
  './src/js/views/setup.js',
  './src/js/views/quick.js',
  './src/js/views/live.js',
  './src/js/views/score.js',
  './src/js/views/scorecard.js',
  './src/js/views/tournaments.js',
  './src/js/views/tournament-detail.js',
  './src/js/views/stats.js',
  './src/js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if one file 404s, so add them one by one.
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(err => console.warn('[sw] skip', url, err))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // nothing external is used

  // Navigations resolve to the app shell so deep links work offline — but the
  // shell is refreshed in the background as well. Serving it from cache and
  // never re-checking would freeze index.html on whatever shipped first.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const shell = await cache.match('./index.html');
      const fresh = fetch('./index.html', { cache: 'no-cache' })
        .then(res => { if (res && res.ok) cache.put('./index.html', res.clone()); return res; })
        .catch(() => null);
      if (shell) { e.waitUntil(fresh); return shell; }
      return (await fresh) || (await cache.match('./')) || fetch(req);
    })());
    return;
  }

  // Stale-while-revalidate: answer instantly from the cache (so the app opens
  // offline and fast), and refresh that entry in the background. This means a
  // redeploy still reaches people on their next visit even if the version
  // constant above was never bumped.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });

    const fromNetwork = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) { e.waitUntil(fromNetwork); return hit; }

    const res = await fromNetwork;
    if (res) return res;
    const fallback = await cache.match('./index.html');
    if (fallback && req.destination === 'document') return fallback;
    return new Response('Offline and not cached yet.', { status: 503, statusText: 'Offline' });
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
