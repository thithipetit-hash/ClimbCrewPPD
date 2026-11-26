// Cache exclusivement les ressources publiques nécessaires à la bibliothèque locale.
// Ne jamais mettre en cache les API, comptes, sauvegardes ou marqueurs de déploiement.
const CACHE_NAME = "climbcrew-competences-shell-261027.004";
const OFFLINE_PATH = "/competences/hors-ligne";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch("/", { cache: "reload", credentials: "omit" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      throw new Error("La page de la bibliothèque est indisponible pour le mode autonome.");
    }
    const html = await response.clone().text();
    await cache.put("/", response);
    // Vite émet des noms hachés pour les bundles JS/CSS au build.
    const urls = [...new Set(
      [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1])
    )];
    const manifestResponse = await fetch("/assets/competences-ffme/manifest.json", { cache: "reload" });
    if (!manifestResponse.ok) throw new Error("Illustrations officielles FFME indisponibles.");
    const manifest = await manifestResponse.json();
    const illustrations = Object.values(manifest.documents || {}).flat();
    if (illustrations.length !== 27 || !illustrations.every((url) =>
      typeof url === "string" && /^\/assets\/competences-ffme\/[a-z0-9-]+-\d{2}\.jpg$/.test(url)
    )) {
      throw new Error("Manifeste des planches FFME incomplet ou invalide.");
    }
    const pdfs = Object.values(manifest.pdfs || {});
    if (pdfs.length !== 12 || !pdfs.every((url) =>
      typeof url === "string" && /^\/assets\/competences-ffme\/[a-z0-9-]+\.pdf$/.test(url)
    )) {
      throw new Error("Les 12 PDF originaux FFME sont manquants ou invalides.");
    }
    const nativeResponse = await fetch("/assets/competences-ffme/illustrations/manifest.json", { cache: "reload" });
    if (!nativeResponse.ok) throw new Error("Manifeste des schémas FFME indisponible.");
    const nativeManifest = await nativeResponse.json();
    const figures = nativeManifest.figures;
    if (!Array.isArray(figures) || figures.length !== 25 ||
      !figures.every((url) => typeof url === "string" &&
        /^\/assets\/competences-ffme\/illustrations\/[a-z0-9-]+-\d{2}\.webp$/.test(url))) {
      throw new Error("Schémas FFME manquants pour la consultation autonome.");
    }
    await cache.addAll([...urls, "/competences-offline.html", "/assets/competences-ffme/manifest.json",
      "/assets/competences-ffme/illustrations/manifest.json", ...figures, ...pdfs]);
    // Ces deux ressources sont facultatives et ne doivent pas invalider le mode hors-ligne.
    await Promise.allSettled(["/site.webmanifest", "/app-icon-32.png"].map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("climbcrew-competences-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith("/api/") || path === "/deployment-version.json" || path.startsWith("/media/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const fallback = path === OFFLINE_PATH ? "/competences-offline.html" : "/";
      const cached = await cache.match(fallback);
      return cached || Response.error();
    }));
    return;
  }

  if (path.startsWith("/assets/") || path === "/site.webmanifest" || path === "/app-icon-32.png") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const found = await cache.match(request, { ignoreSearch: true });
      if (found) return found;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })());
  }
});
