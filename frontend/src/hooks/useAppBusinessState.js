import { useEffect, useState } from "react";

import { todayIso } from "../lib/domain.js";
import { normalizeAppData } from "../lib/normalize.js";

export const BUSINESS_STORAGE_KEY = "climbcrew_local_data_v2";

// Repli local volontairement vide : en mode API, PostgreSQL reste l'unique
// source de vérité pour les participants, séances, voies et réalisations.
export const EMPTY_APP_DATA = {
  exportedAt: null,
  version: "secure-empty-fallback",
  participants: [],
  sessions: [],
  ropes: [],
  routes: [],
  realisations: [],
  selectedDate: "",
  selectedParticipantProgress: "",
};

function emptyInitialState() {
  return normalizeAppData({
    ...EMPTY_APP_DATA,
    selectedDate: todayIso(),
    selectedParticipantProgress: "",
  }, EMPTY_APP_DATA);
}

export function loadInitialBusinessState({ useApi = false, storage = globalThis.localStorage } = {}) {
  if (useApi) {
    // Une ancienne version pouvait laisser des données métier en clair dans le
    // navigateur. Elles sont supprimées dès que l'application utilise l'API.
    try {
      storage?.removeItem(BUSINESS_STORAGE_KEY);
    } catch {
      // Un stockage indisponible ne doit jamais empêcher le démarrage.
    }
    return emptyInitialState();
  }

  try {
    const saved = storage?.getItem(BUSINESS_STORAGE_KEY);
    const base = saved ? JSON.parse(saved) : EMPTY_APP_DATA;
    return normalizeAppData({
      ...base,
      selectedDate: todayIso(),
      selectedParticipantProgress: "",
    }, EMPTY_APP_DATA);
  } catch {
    return emptyInitialState();
  }
}

export function persistBusinessState(state, { useApi = false, storage = globalThis.localStorage } = {}) {
  if (useApi) return;
  try {
    storage?.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Mode local dégradé : l'état React continue de fonctionner en mémoire.
  }
}

export function useAppBusinessState({ useApi = false } = {}) {
  const [state, setState] = useState(() => loadInitialBusinessState({ useApi }));

  useEffect(() => {
    persistBusinessState(state, { useApi });
  }, [state, useApi]);

  return [state, setState];
}
