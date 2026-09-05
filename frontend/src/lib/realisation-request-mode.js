import { normalizeRealisationMode } from "./realisation-mode.js";

let pendingRealisationMode = "en_tete";

export function setPendingRealisationMode(mode) {
  pendingRealisationMode = normalizeRealisationMode(mode) || "en_tete";
}

export function getPendingRealisationMode() {
  return pendingRealisationMode;
}

export function enrichRealisationCreateOptions(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "POST" || !/^\/realisations(?:\?|$)/.test(String(path || ""))) {
    return options;
  }

  if (typeof options.body !== "string") return options;

  try {
    const payload = JSON.parse(options.body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return options;
    if (normalizeRealisationMode(payload.modeRealisation)) return options;

    return {
      ...options,
      body: JSON.stringify({
        ...payload,
        modeRealisation: pendingRealisationMode,
      }),
    };
  } catch {
    return options;
  }
}
