export const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const USE_API = Boolean(API_BASE);

const inFlightGetRequests = new Map();

export function readCookie(name) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

export function csrfHeaders(method = "GET") {
  const upperMethod = String(method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(upperMethod)) return {};
  const csrfToken = readCookie("climbcrew_csrf");
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

async function performApiFetch(path, options = {}) {
  const method = options.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(method),
      ...(options.headers || {})
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erreur API ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  // Au démarrage, App peut demander les mêmes données une première fois pendant
  // la vidéo d'introduction puis une seconde fois lorsque /auth/me se termine.
  // Tant qu'une requête GET identique est déjà en cours, on partage sa Promise
  // au lieu d'émettre un second appel réseau. L'application continue donc à se
  // charger derrière la vidéo, sans trafic ni latence dupliqués.
  if (method === "GET") {
    const requestKey = `${API_BASE}${path}`;
    const existingRequest = inFlightGetRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = performApiFetch(path, options)
      .finally(() => {
        if (inFlightGetRequests.get(requestKey) === request) {
          inFlightGetRequests.delete(requestKey);
        }
      });

    inFlightGetRequests.set(requestKey, request);
    return request;
  }

  return performApiFetch(path, options);
}

export async function apiUpload(path, file, options = {}) {
  const method = options.method || "POST";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": file?.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file?.name || "video"),
      ...csrfHeaders(method),
      ...(options.headers || {}),
    },
    body: file,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erreur API ${response.status}`);
  }
  return response.json();
}

export async function authApiFetch(path, _token, options = {}) {
  return apiFetch(path, options);
}

export function downloadFile(filename, content, type = "application/json;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
