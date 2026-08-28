const CACHE = "teamkompass-shell-v2";
const SHELL = ["./", "./index.html", "./base.css", "./styles.css", "./mobile.css", "./app.js", "./next-level.js", "./manifest.webmanifest", "./assets/club-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    // Die Shell nur bei echten Seitenaufrufen nachreichen. Frueher bekam auch
    // ein fehlgeschlagener Skript- oder Stylesheet-Aufruf die index.html
    // zurueck - also HTML statt JavaScript, was die App still zerlegt hat.
    if (event.request.mode === "navigate") return caches.match("./index.html");
    return Response.error();
  }));
});
