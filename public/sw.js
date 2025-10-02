importScripts('https://cdnjs.cloudflare.com/ajax/libs/workbox-sw/7.3.0/workbox-sw.js');

/* Activer immédiatement la nouvelle version */
self.skipWaiting();
workbox.core.clientsClaim();

/* Noms des caches */
workbox.core.setCacheNameDetails({
  prefix: 'chat-client',
  suffix: 'v1',
});

/* Utiles pour tracer (mettre true si besoin) */
const DEBUG = false;
if (DEBUG) workbox.setConfig({ debug: true });

const APP_SHELL_CACHE = 'chat-client-app-shell';
const APP_SHELL_ASSETS = [
  '/',
  '/camera',
  '/gallery',
  '/offline.html',
  '/images/icons/Logo-192x192.png',
  '/images/icons/Logo-512x512.png',
  '/manifest.json',
];

/* ---------------
   Pré-chargement minimal (fallback + icônes)
   --------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.addAll(APP_SHELL_ASSETS).catch((error) => {
        if (DEBUG) console.warn('[SW] pre-cache error', error);
      })
    )
  );
});

/* ---------------
   Fallback offline pour navigations (pages)
   --------------- */
workbox.recipes.offlineFallback({
  pageFallback: '/offline.html',
});

/* ---------------
   Stratégies de cache
   --------------- */

/* 1) Assets Next.js (_next/static) -> CacheFirst long */
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/_next/static/'),
  new workbox.strategies.CacheFirst({
    cacheName: 'chat-client-next-static',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/* 2) Scripts/Styles/Workers -> StaleWhileRevalidate */
workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'chat-client-static',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 200,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/* 3) Images (y compris avatars) -> CacheFirst + quota */
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'chat-client-images',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/* 4) GET API (historique, conversations, etc.)
      -> StaleWhileRevalidate (offline: on resert la dernière vue) */
const isApiGet = ({ url, request }) =>
  url.pathname.startsWith('/api/') && request.method === 'GET';

workbox.routing.registerRoute(
  isApiGet,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'chat-client-api-get',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 jours
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/* 5) Pièces jointes (images/pdf/audio/vidéo) -> CacheFirst
      + support Range pour media (si le serveur le demande) */
const isAttachment = ({ url, request }) => {
  const p = url.pathname;
  const mediaDest =
    request.destination === 'video' || request.destination === 'audio';
  return (
    mediaDest ||
    p.startsWith('/api/attachments/') ||
    p.startsWith('/uploads/') ||
    p.includes('/attachments/')
  );
};

const mediaCache = 'chat-client-attachments';

async function handleRangeRequest(request, responseFromCacheOrNet) {
  // Inspiré de la doc "Handling range requests in a service worker" (web.dev).
  // https://web.dev/articles/sw-range-requests
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader || !responseFromCacheOrNet || !responseFromCacheOrNet.ok) {
    return responseFromCacheOrNet;
  }

  const size = parseInt(
    responseFromCacheOrNet.headers.get('content-length') || '0',
    10
  );
  const m = /^bytes=(\d+)-(\d+)?$/i.exec(rangeHeader);
  if (!m) return responseFromCacheOrNet;

  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : size - 1;
  const chunk = await responseFromCacheOrNet.arrayBuffer();
  const sliced = chunk.slice(start, end + 1);
  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: [
      ['Content-Range', `bytes ${start}-${end}/${size}`],
      ['Content-Length', String(sliced.byteLength)],
      ['Accept-Ranges', 'bytes'],
      ['Content-Type', responseFromCacheOrNet.headers.get('Content-Type') || 'application/octet-stream'],
    ],
  });
}

workbox.routing.registerRoute(
  isAttachment,
  async ({ event, request }) => {
    const cache = await caches.open(mediaCache);

    // Essayer le cache d’abord
    let res = await cache.match(request);
    if (!res) {
      try {
        res = await fetch(request);
        if (res && res.ok) {
          event.waitUntil(cache.put(request, res.clone()));
        }
      } catch (e) {
        // Pas de réseau ni de cache -> laisser le fallback global agir (offline page)
        return Response.error();
      }
    }

    // Gérer les requêtes Range (lecture partielle)
    if (request.headers.has('range')) {
      return handleRangeRequest(request, res);
    }
    return res.clone();
  }
);

/* ---------------
   Mutations API (POST/PUT/PATCH/DELETE) -> Background Sync
   - Création/modification profil (pseudo, photo)
   - Désinscription d’une conversation
   - Créer une conversation
   - Participer à une conversation (poster un message, rejoindre, etc.)
   --------------- */

const mutationsQueueName = 'chat-client-mutations';
const broadcast = new BroadcastChannel('sw-messages');

const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin(
  mutationsQueueName,
  {
    maxRetentionTime: 24 * 60, // en minutes (24h)
    onSync: async ({ queue }) => {
      // Rejouer toutes les requêtes en attente
      let replayed = [];
      try {
        replayed = await queue.replayRequests();
        // Notifier le client que la sync est terminée
        broadcast.postMessage({ type: 'BG_SYNC_REPLAYED', count: replayed.length });
      } catch (err) {
        broadcast.postMessage({ type: 'BG_SYNC_ERROR', error: String(err) });
        throw err;
      }
    },
  }
);

// Applique NetworkOnly + queue de secours à TOUTES les routes sous /api/ pour ces méthodes
['POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
  workbox.routing.registerRoute(
    ({ url, request }) => url.pathname.startsWith('/api/') && request.method === method,
    new workbox.strategies.NetworkOnly({
      plugins: [bgSyncPlugin],
    }),
    method
  );
});

/* ---------------
   Navigation par défaut : NetworkFirst + fallback offline déjà configuré
   --------------- */
workbox.routing.setDefaultHandler(
  new workbox.strategies.NetworkFirst({
    cacheName: 'chat-client-pages',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/* ---------------
   Gestion des mises à jour (skipWaiting sur demande)
   --------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/gallery';

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('focus' in client && client.url.includes(targetUrl)) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
