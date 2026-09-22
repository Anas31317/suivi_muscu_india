/**
 * Service worker : rend le site utilisable hors ligne (salle sans réseau).
 *
 * - Fichiers du site : « réseau d'abord », copie en cache en secours.
 * - Pages : toujours mises en cache sous ./index.html, jamais sous leur URL
 *   réelle (qui peut contenir un code de connexion à usage unique).
 * - Aucune requête vers Supabase n'est interceptée ni mise en cache : les
 *   données personnelles ne passent jamais par ce cache.
 */

const CACHE = 'suivi-muscu-v5';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/auth.js',
  './js/auth-views.js',
  './js/config.js',
  './js/store.js',
  './js/seed.js',
  './js/charts.js',
  './js/insights.js',
  './js/logo.js',
  './js/theme.js',
  './js/sync.js',
  './js/ui.js',
  './js/views/common.js',
  './js/views/dashboard.js',
  './js/views/sessions.js',
  './js/views/workout.js',
  './js/views/session-editor.js',
  './js/views/cardio.js',
  './js/views/history.js',
  './js/views/progression.js',
  './js/views/programme.js',
  './js/views/profile.js',
  './js/vendor/supabase-2.116.0.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
