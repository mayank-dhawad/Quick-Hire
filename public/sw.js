/**
 * QuickHire Production Service Worker
 * Version: 1.1.0
 * 
 * Strategy:
 * 1. Network-Only for all Supabase API, authentication, database mutations, and sensitive endpoints.
 * 2. Network-First with SPA Shell Cache Fallback for HTML navigations.
 * 3. Cache-First (with network refresh) for versioned static assets (JS, CSS, icons, fonts).
 * 4. Stale-While-Revalidate for local app shell assets.
 */

const CACHE_VERSION = 'v1.2.0';
const PRECACHE_NAME = `quickhire-precache-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `quickhire-runtime-${CACHE_VERSION}`;

// Precached app shell assets
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.svg',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

// Domains and endpoints that MUST NEVER be cached under any circumstances
function isSensitiveOrDynamic(url) {
  const urlStr = url.toString().toLowerCase();
  
  // 1. Supabase Auth, REST API, RPC, Storage
  if (urlStr.includes('.supabase.co')) return true;
  if (urlStr.includes('/auth/v1/')) return true;
  if (urlStr.includes('/rest/v1/')) return true;
  if (urlStr.includes('/storage/v1/')) return true;

  // 2. SMS / OTP endpoints (Fast2SMS / Hooks)
  if (urlStr.includes('fast2sms')) return true;
  if (urlStr.includes('send-sms')) return true;

  // 3. Geocoding private coordinates
  if (urlStr.includes('nominatim.openstreetmap.org')) return true;

  return false;
}

// 1. INSTALL EVENT — Precache shell and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[QuickHire SW] Precache partial error (ignored for resilient start):', err);
        });
      })
      .then(() => undefined)
  );
});

// 2. ACTIVATE EVENT — Clean up outdated caches from previous versions
self.addEventListener('activate', (event) => {
  const allowedCaches = [PRECACHE_NAME, RUNTIME_CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (!allowedCaches.includes(name)) {
              console.log('[QuickHire SW] Purging obsolete cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. FETCH EVENT — Enforce security & appropriate caching policies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // A. Non-GET requests (POST, PUT, DELETE, PATCH): Always Network-Only
  if (request.method !== 'GET') {
    return;
  }

  // Development bypass: Never intercept Vite internal modules, HMR, or local dev paths
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@fs') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t')
  ) {
    return;
  }

  // B. Security: Never cache Supabase, Auth, RPC, or SMS requests
  if (isSensitiveOrDynamic(url)) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            error: 'Network offline. Action requires internet connection.',
            offline: true
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // C. HTML Navigation Requests: Network-First with SPA Shell Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If network returns a valid page, update the precache for index.html & root
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(PRECACHE_NAME).then((cache) => {
              cache.put('/index.html', responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          // SPA offline fallback: Match exact request, then /index.html, then /
          const cache = await caches.open(PRECACHE_NAME);
          const cachedIndex =
            (await cache.match(request)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/'));

          if (cachedIndex) {
            return cachedIndex;
          }

          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }

          return new Response('Offline — Please check your network connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // D. Static Vite Assets (JS, CSS, Web Fonts, Images): Cache-First with Network Fallback
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.woff') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg'));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Return empty fallback or 404 for missing static resource
            return new Response('', { status: 404, statusText: 'Resource Not Cached' });
          });
      })
    );
    return;
  }

  // E. All Other GET Requests: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. MESSAGE EVENT — Support SKIP_WAITING for instant user-triggered updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

