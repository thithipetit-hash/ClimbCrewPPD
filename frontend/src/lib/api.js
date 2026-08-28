export const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const USE_API = Boolean(API_BASE);

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

export async function apiFetch(path, options = {}) {
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
