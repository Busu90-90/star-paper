const CANONICAL_NETLIFY_ORIGIN = "https://star-paper.netlify.app";

async function clearCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

function toCanonicalUrl(urlLike) {
  const url = new URL(urlLike, self.location.href);
  url.protocol = "https:";
  url.hostname = "star-paper.netlify.app";
  return url.toString();
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(clearCaches());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await clearCaches();
    await self.clients.claim();
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    await Promise.all(clients.map((client) =>
      client.navigate(toCanonicalUrl(client.url)).catch(() => {})
    ));
    await self.registration.unregister();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(Response.redirect(toCanonicalUrl(event.request.url), 302));
});
