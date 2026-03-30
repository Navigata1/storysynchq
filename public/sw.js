/**
 * StorySyncHQ Service Worker
 * Phase 8 — Offline Support & PWA
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `ssync-shell-${CACHE_VERSION}`;
const IMAGE_CACHE = `ssync-images-${CACHE_VERSION}`;

// App shell files to cache on install
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/demo/brave-little-star.ssync.json',
];

// Demo storybook images to cache for offline reading
const DEMO_IMAGES = [
  '/demo/images/page1.jpg',
  '/demo/images/page2.jpg',
  '/demo/images/page3.jpg',
  '/demo/images/page4.jpg',
  '/demo/images/page5.jpg',
  '/demo/images/page6.jpg',
  '/demo/images/page7.jpg',
];

// ── Install: cache app shell + demo images ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => {
        return cache.addAll(SHELL_ASSETS).catch((err) => {
          console.warn('[SW] Failed to cache some shell assets:', err);
        });
      }),
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.addAll(DEMO_IMAGES).catch((err) => {
          console.warn('[SW] Failed to cache some demo images:', err);
        });
      }),
    ]).then(() => {
      // Skip waiting so new SW activates immediately
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  const allowedCaches = [SHELL_CACHE, IMAGE_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !allowedCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch: serve from cache or network ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return; // Let browser handle cross-origin (fonts, etc.)
  }

  // API calls: network-first, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline — API unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Images: cache-first
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(IMAGE_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        }).catch(() => {
          // Return a simple SVG placeholder for images when offline
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
              <rect width="400" height="300" fill="#0f1422"/>
              <text x="50%" y="50%" text-anchor="middle" fill="#F59E0B" font-family="sans-serif" font-size="16">
                📴 Image offline
              </text>
            </svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // Static assets (JS, CSS, fonts): cache-first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(js|css|woff|woff2|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // JSON/data files (including demo storybook): cache-first, fallback to network
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.ssync.json')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        }).catch(() => {
          return new Response(
            JSON.stringify({ error: 'Offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
    );
    return;
  }

  // HTML navigation: network-first, fallback to cached shell
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const cloned = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, cloned));
      }
      return response;
    }).catch(() => {
      // Offline fallback: serve cached home page
      return caches.match('/').then((cached) => {
        if (cached) return cached;
        return new Response(
          `<!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>StorySyncHQ — Offline</title>
            <style>
              body { background: #0a0e1a; color: white; font-family: sans-serif;
                     display: flex; flex-direction: column; align-items: center;
                     justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
              h1 { color: #F59E0B; font-size: 2rem; }
              p { color: #9ca3af; max-width: 300px; }
            </style>
          </head>
          <body>
            <h1>📴 You're offline</h1>
            <p>StorySyncHQ couldn't load. Connect to the internet and try again.</p>
            <button onclick="location.reload()"
                    style="margin-top:20px; padding:12px 24px; background:#F59E0B; border:none;
                           border-radius:12px; color:#000; font-weight:bold; cursor:pointer; font-size:1rem;">
              Try Again
            </button>
          </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    })
  );
});
