export const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const USE_API = Boolean(API_BASE);

const inFlightGetRequests = new Map();

const STATUS_MESSAGES = {
  400: "La demande contient des informations invalides.",
  401: "Email ou mot de passe incorrect.",
  403: "Vous n’avez pas l’autorisation d’effectuer cette action.",
  404: "Le service demandé est introuvable.",
  409: "Cette opération entre en conflit avec des données existantes.",
  422: "Certaines informations saisies sont invalides.",
  429: "Trop de tentatives. Réessayez dans quelques instants.",
};

const KNOWN_MESSAGES = new Map([
  ["identifiants invalides", "Email ou mot de passe incorrect."],
  ["compte pending", "Votre demande d’accès est en attente d’approbation."],
  ["compte revoked", "Votre accès a été désactivé. Contactez un administrateur."],
  ["authentification requise", "Votre session a expiré. Reconnectez-vous."],
  ["session invalide ou compte non actif", "Votre session n’est plus valide. Reconnectez-vous."],
]);

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

function firstMessage(value, depth = 0) {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => firstMessage(item, depth + 1)).find(Boolean) || "";
  }
  if (typeof value === "object") {
    for (const key of ["error", "message", "detail", "title", "errors"]) {
      const message = firstMessage(value[key], depth + 1);
      if (message) return message;
    }
    for (const child of Object.values(value)) {
      const message = firstMessage(child, depth + 1);
      if (message) return message;
    }
  }
  return "";
}

function messageFromBody(rawBody) {
  const body = String(rawBody || "").trim();
  if (!body) return "";
  try {
    return firstMessage(JSON.parse(body));
  } catch {
    const looksLikeHtml = /^(?:<!doctype\s+html|<html|<body)/i.test(body);
    return !looksLikeHtml && body.length <= 500 ? body : "";
  }
}

function normalizeKnownMessage(message) {
  const compact = String(message || "").trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return KNOWN_MESSAGES.get(compact.toLocaleLowerCase("fr")) || compact;
}

function fallbackMessage(status) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return "Le serveur a rencontré une erreur. Réessayez plus tard.";
  return "Une erreur est survenue. Réessayez.";
}

async function responseErrorMessage(response) {
  let rawBody = "";
  try {
    rawBody = await response.text();
  } catch {
    // Le statut HTTP suffit pour produire un message de secours.
  }
  return normalizeKnownMessage(messageFromBody(rawBody)) || fallbackMessage(response.status);
}

async function fetchWithReadableErrors(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const networkError = new Error("Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.");
    networkError.cause = error;
    throw networkError;
  }
}

async function performApiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const { headers: optionHeaders = {}, ...restOptions } = options;
  const response = await fetchWithReadableErrors(`${API_BASE}${path}`, {
    credentials: "include",
    ...restOptions,
    method,
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(method),
      ...optionHeaders,
    },
  });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  // Au démarrage, App peut demander les mêmes données une première fois pendant
  // la vidéo d'introduction puis une seconde fois lorsque /auth/me se termine.
  // Tant qu'une requête GET identique est déjà en cours, on partage sa Promise.
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
  const method = String(options.method || "POST").toUpperCase();
  const { headers: optionHeaders = {}, ...restOptions } = options;
  const response = await fetchWithReadableErrors(`${API_BASE}${path}`, {
    credentials: "include",
    ...restOptions,
    method,
    headers: {
      "Content-Type": file?.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file?.name || "video"),
      ...csrfHeaders(method),
      ...optionHeaders,
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return response.json();
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
