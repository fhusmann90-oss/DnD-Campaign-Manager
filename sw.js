/**
 * sw.js - Service Worker für den Offline-Betrieb (ab 1.4)
 * ---------------------------------------------------------------------------
 * Hält alle App-Dateien im Browser-Cache, damit die App auch ohne Netz
 * startet. Strategie "Netz zuerst": online kommt immer die aktuelle Version
 * von GitHub Pages (und landet im Cache), offline die zuletzt geladene.
 * Anfragen an Supabase (andere Domain) werden NICHT angefasst.
 *
 * WICHTIG bei neuen Dateien: in APP_FILES eintragen. CACHE_VERSION erhöhen,
 * damit alte Caches aufgeräumt werden.
 * ---------------------------------------------------------------------------
 */

const CACHE_VERSION = 'v1.4';
const CACHE_NAME = 'dnd-tracker-' + CACHE_VERSION;
const NETWORK_TIMEOUT_MS = 4000;

const APP_FILES = [
  './',
  './css/styles.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './index.html',
  './js/app.js',
  './js/config.js',
  './js/data/rules.js',
  './js/data/srdMonsters.js',
  './js/data/storySchema.js',
  './js/migrate.js',
  './js/pdfCharacterParser.js',
  './js/state.js',
  './js/sync.js',
  './js/ui/abilityPanel.js',
  './js/ui/characterDetails.js',
  './js/ui/characterEditor.js',
  './js/ui/encounterView.js',
  './js/ui/formHelpers.js',
  './js/ui/importFlow.js',
  './js/ui/libraryView.js',
  './js/ui/monsterEditor.js',
  './js/ui/rosterView.js',
  './js/ui/shared.js',
  './js/ui/storyView.js',
  './js/ui/trackerWidgets.js',
  './js/version.js',
  './lib/pdf.min.js',
  './lib/pdf.worker.min.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dnd-tracker-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & Co. nicht cachen

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fromNetwork(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html') || await cache.match('./');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
