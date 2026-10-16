const VERSION = 's13-v1';
const STATIC_CACHE = `copilot-isles-static-${VERSION}`;
const RUNTIME_CACHE = `copilot-isles-runtime-${VERSION}`;
const COURSE_CACHE = `copilot-isles-course-${VERSION}`;
const MANIFEST_RE = /\/packs\/manifest\.json$/;
// Live course content (PLAN §8.2, §13.6): the course repo's files on raw.githubusercontent.com only.
const COURSE_RE = /^https:\/\/raw\.githubusercontent\.com\/github\/copilot-app-for-beginners\//;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('copilot-isles-') &&
                key !== STATIC_CACHE &&
                key !== RUNTIME_CACHE &&
                key !== COURSE_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Media streams (the music's <audio> elements, Range requests) go straight to the network: the
  // Cache API can't store a partial (206) response, and answering a Range request with a whole
  // cached file breaks streaming. Music and voice aren't under the cached paths anyway.
  if (request.headers.has('range')) return;
  const url = new URL(request.url);
  if (COURSE_RE.test(request.url)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }
  if (url.origin !== location.origin) return;

  if (MANIFEST_RE.test(url.pathname) || request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // The Basis transcoder (KTX2 textures, public/basis/) is fixed per three.js release: cache-first too.
  if (
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/basis/') ||
    (url.pathname.includes('/packs/') && url.searchParams.has('v'))
  ) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Course text and pictures: answer from the cache at once and refresh it in the background, so the
 * next visit gets the new course version. The game keeps each document for the session, so nothing
 * changes mid-conversation. Failures without a cached copy reject, and the game uses its snapshot.
 */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(COURSE_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}
