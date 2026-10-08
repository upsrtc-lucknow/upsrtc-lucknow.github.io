// Offline service worker for the UPSRTC PO app.
// Install: precache every built file listed in precache-manifest.json.
// Runtime: app shell is network-first (so new builds arrive), assets are cache-first.

const CACHE = 'upsrtc-po-shell'
const MANIFEST = 'precache-manifest.json'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(MANIFEST, { cache: 'no-store' })
      const { files } = await response.clone().json()
      const cache = await caches.open(CACHE)
      await cache.addAll(files.map((file) => new Request(file, { cache: 'reload' })))
      await cache.put(MANIFEST, response)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop hashed assets from previous builds.
      const cache = await caches.open(CACHE)
      const manifest = await cache.match(MANIFEST)
      if (manifest) {
        const { files } = await manifest.json()
        const keep = new Set([...files, MANIFEST].map((file) => new URL(file, self.registration.scope).href))
        const requests = await cache.keys()
        await Promise.all(requests.filter((req) => !keep.has(req.url)).map((req) => cache.delete(req)))
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(async () => (await caches.match('./')) || (await caches.match('index.html'))),
    )
    return
  }

  // The build manifest carries the live version the app checks for updates — always ask
  // the network, and fall back to the cached copy only when offline.
  if (new URL(request.url).pathname.endsWith(`/${MANIFEST}`)) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(MANIFEST)))
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
