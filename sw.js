/*
 * sw.js — lets Applywise open offline and install as an app (phone, tablet, desktop, Play Store).
 * App files: network first (so updates arrive straight away), cached copy when offline.
 * Libraries and fonts from CDNs: cached copy first, refreshed in the background.
 * Job sites, AI engines and anything else: always live, never cached.
 */
const VERSION = 'aw-5.8.1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './assets/styles.css', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
  './privacy.html', './terms.html',
  ...['agent', 'app', 'autofill', 'autopilot', 'countries', 'demo', 'docs', 'docx-engine', 'drills', 'employers', 'fields', 'jobs', 'layout', 'mindmap', 'myqs', 'prep', 'shell', 'store',
    'studio', 'sync', 'ui', 'views', 'websources', 'welcome', 'pwa', 'engine', 'art', 'quotes', 'assistant', 'workspace', 'tasks', 'selftest'].map(n => `./js/${n}.js`)];
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// The page asks the new version to take over when you press "Update now".
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same) {
    // Collected-jobs data changes often: never serve it from the cache.
    if (/\/data\//.test(url.pathname)) return;
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(stripQuery(req), res.clone());
        return res;
      } catch (_) {
        const hit = await cache.match(stripQuery(req)) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
        return hit || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }
  if (CDN.test(req.url)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
// "js/app.js?v=4.6" and "js/app.js" are the same file for the offline copy.
function stripQuery(req) { const u = new URL(req.url); u.search = ''; return new Request(u.toString()); }
