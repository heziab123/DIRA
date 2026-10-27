// Keeps the app cached so the converter opens without internet.
// Online it always loads the latest files; offline (or on a very slow network) it falls back to the cache.
// Bump the version on every release so installed copies update.
const CACHE_PREFIX = "currency-";
const CACHE = `${CACHE_PREFIX}v3`;
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // "reload" skips the browser's HTTP cache, so a new version never precaches stale files.
  const requests = ASSETS.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Only this app's caches: other sites on the same github.io origin share the cache storage.
      const stale = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE);
      await Promise.all(stale.map((key) => caches.delete(key)));
      await self.clients.claim();

      if (stale.length > 0) {
        // Upgrading from an older version: reload open windows so they show the new one right away.
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach((client) => client.navigate(client.url).catch(() => {}));
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(networkFirst(event, request));
});

async function networkFirst(event, request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request, { cache: "no-cache" }).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));

  try {
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    const response = await Promise.race([network, timeout]);
    if (response) {
      return response;
    }
  } catch {
    // Offline: use the cached copy below.
  }

  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
  return cached || network;
}
