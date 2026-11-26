const CACHE_PREFIX = 'retroradtv-v4-';
const CACHE_NAME = CACHE_PREFIX + '4.1.102';
// Only the core shell is precached. Artwork and optional modules cache on demand.
const APP_FILES = [
  './receiver-responsive.css?v=4.1.75', './index.html', './styles.css?v=4.1.11', './app.js?v=4.1.93',
  './tv-auto-fullscreen.js?v=3.0.165',
  './stream-recovery.js?v=4.1.4', './volume-knob.js?v=4.1.10',
  './station-category.js?v=2', './preset-defaults.js?v=4.1.73',
  './shattered-theme.css?v=1', './manifest.webmanifest', './icon.svg',
  './assets/station-logos/radio_badge.png', './assets/station-logos/tv_badge.png'
];
self.addEventListener('install', event => {
  const freshFiles = APP_FILES.map(url => new Request(url, {cache: 'reload'}));
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(freshFiles)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept streams or other third-party requests.
  if (url.origin !== self.location.origin) return;
  const isPage = request.mode === 'navigate' || url.pathname.endsWith('/index.html');
  const networkFirst = isPage || /\/[^/]+\.json$/.test(url.pathname);
  const cacheFirst = url.searchParams.has('v') || /\.(svg|png)$/i.test(url.pathname);
  if (!networkFirst && !cacheFirst) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (!networkFirst && cached) return cached;
    try {
      const response = isPage ? await fetch(request, {cache: 'no-store'}) : await fetch(request);
      if (response.ok) {
        // Cache failures must never turn a successful network fetch into a failure.
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      }
      return response;
    } catch {
      return cached || (isPage && await cache.match('./index.html')) || Response.error();
    }
  })());
});
