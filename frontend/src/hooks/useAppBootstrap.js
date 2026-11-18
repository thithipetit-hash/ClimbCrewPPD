import { useCallback, useEffect, useRef } from "react";

import { apiFetch } from "../lib/api.js";
import {
  BUSINESS_BOOTSTRAP_ENDPOINTS,
  REALISATIONS_PAGE_SIZE,
  fetchPaginatedCollection,
  mergeBootstrapCollections,
  mergeSessionWindow,
  summarizeBootstrapResults,
} from "../lib/bootstrap-data.js";

const REALISATIONS_PATH = "/realisations";
const SESSIONS_PATH = "/sessions";
const SESSION_WINDOW_PAST_DAYS = 90;
const SESSION_WINDOW_FUTURE_DAYS = 180;

function isoDayOffset(days, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recentSessionWindow(now = new Date()) {
  return {
    from: isoDayOffset(-SESSION_WINDOW_PAST_DAYS, now),
    to: isoDayOffset(SESSION_WINDOW_FUTURE_DAYS, now),
  };
}

export function recentSessionsPath(now = new Date()) {
  const { from, to } = recentSessionWindow(now);
  return `${SESSIONS_PATH}?from=${from}&to=${to}`;
}

function loadBootstrapEndpoint([key, path], { recentOnly = false } = {}) {
  if (key === "sessions" && recentOnly) return apiFetch(recentSessionsPath());
  if (key !== "realisations") return apiFetch(path);
  if (recentOnly) {
    return apiFetch(`${path}?limit=${REALISATIONS_PAGE_SIZE}&offset=0`);
  }

  return fetchPaginatedCollection(
    ({ limit, offset }) => apiFetch(`${path}?limit=${limit}&offset=${offset}`),
    { pageSize: REALISATIONS_PAGE_SIZE },
  );
}

function loadRemainingRealisations(initialItems, { isActive = () => true } = {}) {
  if (!Array.isArray(initialItems) || initialItems.length < REALISATIONS_PAGE_SIZE) {
    return Promise.resolve(Array.isArray(initialItems) ? initialItems : []);
  }

  return fetchPaginatedCollection(
    async ({ limit, offset }) => {
      if (!isActive()) throw new Error("Hydratation des réalisations annulée");
      return apiFetch(`${REALISATIONS_PATH}?limit=${limit}&offset=${offset}`);
    },
    {
      pageSize: REALISATIONS_PAGE_SIZE,
      startOffset: REALISATIONS_PAGE_SIZE,
      initialItems,
    },
  );
}

export function useAppBootstrap({
  useApi,
  authUserId,
  setAuthUser,
  setAuthLoading,
  setThemePreference,
  setAdminUnlocked,
  setPendingBroadcastMessages,
  setBroadcastMessageError,
  setState,
  setIsSyncing,
  setSyncMessage,
}) {
  const historyTokenRef = useRef(null);
  const sessionHistoryTokenRef = useRef(null);

  const reloadApiState = useCallback(async ({
    isMounted = () => true,
    recentOnly = false,
    requireComplete = false,
  } = {}) => {
    if (!recentOnly) {
      historyTokenRef.current = null;
      sessionHistoryTokenRef.current = null;
    }
    setIsSyncing(true);
    try {
      const settledResults = await Promise.allSettled(
        BUSINESS_BOOTSTRAP_ENDPOINTS.map((endpoint) => loadBootstrapEndpoint(endpoint, { recentOnly })),
      );

      if (!isMounted()) return null;

      const summary = summarizeBootstrapResults(settledResults);
      if (requireComplete && summary.failureCount) {
        throw new Error("Actualisation incomplète des données : veuillez réessayer.");
      }
      const nextState = mergeBootstrapCollections({}, settledResults);
      const realisationsIndex = BUSINESS_BOOTSTRAP_ENDPOINTS.findIndex(([key]) => key === "realisations");
      const realisationsResult = settledResults[realisationsIndex];
      const hasDeferredHistory = recentOnly
        && realisationsResult?.status === "fulfilled"
        && Array.isArray(realisationsResult.value)
        && realisationsResult.value.length >= REALISATIONS_PAGE_SIZE;

      setState((previous) => mergeBootstrapCollections(previous, settledResults));
      setSyncMessage(
        summary.failureCount
          ? "Données partiellement actualisées"
          : hasDeferredHistory
            ? "Données récentes chargées · historique en cours"
            : "Données actualisées",
      );

      if (summary.allFailed) {
        throw summary.firstError || new Error("API indisponible");
      }

      return nextState;
    } catch (error) {
      if (isMounted()) {
        setSyncMessage("API indisponible · données précédentes conservées");
        console.error(error);
      }
      throw error;
    } finally {
      if (isMounted()) setIsSyncing(false);
    }
  }, [setIsSyncing, setState, setSyncMessage]);


  const hydrateSessions = useCallback(async ({ isMounted = () => true, token = null } = {}) => {
    const isActive = () => isMounted() && sessionHistoryTokenRef.current === token;
    try {
      const completeSessions = await apiFetch(SESSIONS_PATH);
      if (!isActive() || !Array.isArray(completeSessions)) return null;
      setState((previous) => {
        const merged = new Map(completeSessions.map((session) => [String(session.id), session]));
        previous.sessions.forEach((session) => merged.set(String(session.id), session));
        return { ...previous, sessions: [...merged.values()] };
      });
      sessionHistoryTokenRef.current = null;
      return completeSessions;
    } catch (error) {
      if (isActive()) {
        sessionHistoryTokenRef.current = null;
        setSyncMessage("Données récentes chargées · historique des séances indisponible");
        console.error(error);
      }
      return null;
    }
  }, [setState, setSyncMessage]);

  const hydrateRealisations = useCallback(async (
    initialItems,
    { isMounted = () => true, token = null } = {},
  ) => {
    if (!Array.isArray(initialItems) || initialItems.length < REALISATIONS_PAGE_SIZE) {
      if (historyTokenRef.current === token) historyTokenRef.current = null;
      return Array.isArray(initialItems) ? initialItems : [];
    }

    const isActive = () => isMounted() && historyTokenRef.current === token;

    try {
      const completeHistory = await loadRemainingRealisations(initialItems, { isActive });
      if (!isActive()) return null;

      setState((previous) => ({ ...previous, realisations: completeHistory }));
      setSyncMessage("Données actualisées");
      historyTokenRef.current = null;
      return completeHistory;
    } catch (error) {
      if (isActive()) {
        historyTokenRef.current = null;
        setSyncMessage("Données récentes chargées · historique indisponible");
        console.error(error);
      }
      return null;
    }
  }, [setState, setSyncMessage]);

  useEffect(() => {
    if (!authUserId) {
      historyTokenRef.current = null;
      sessionHistoryTokenRef.current = null;
    }
  }, [authUserId]);

  useEffect(() => {
    if (!useApi) {
      setAuthLoading(false);
      return undefined;
    }

    let isMounted = true;
    const historyToken = Symbol("realisations-history");
    const sessionHistoryToken = Symbol("sessions-history");
    historyTokenRef.current = historyToken;
    sessionHistoryTokenRef.current = sessionHistoryToken;

    (async () => {
      try {
        setAuthLoading(true);
        const data = await apiFetch("/auth/me");
        if (!isMounted) return;
        setAuthUser(data.user);
        if (data.user?.theme_preference) {
          setThemePreference(data.user.theme_preference);
        }
        if (data.user?.role === "admin") {
          setAdminUnlocked(true);
        }

        const recentState = await reloadApiState({
          isMounted: () => isMounted,
          recentOnly: true,
        }).catch(() => null);

        if (!isMounted) return;
        setAuthLoading(false);

        void hydrateSessions({
          isMounted: () => isMounted,
          token: sessionHistoryToken,
        });

        if (recentState?.realisations?.length >= REALISATIONS_PAGE_SIZE) {
          void hydrateRealisations(recentState.realisations, {
            isMounted: () => isMounted,
            token: historyToken,
          });
        } else if (historyTokenRef.current === historyToken) {
          historyTokenRef.current = null;
        }
      } catch {
        if (!isMounted) return;
        historyTokenRef.current = null;
        sessionHistoryTokenRef.current = null;
        setAuthUser(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      if (historyTokenRef.current === historyToken) historyTokenRef.current = null;
      if (sessionHistoryTokenRef.current === sessionHistoryToken) sessionHistoryTokenRef.current = null;
    };
  }, [
    hydrateRealisations,
    hydrateSessions,
    reloadApiState,
    setAdminUnlocked,
    setAuthLoading,
    setAuthUser,
    setThemePreference,
    useApi,
  ]);

  useEffect(() => {
    if (!useApi || !authUserId) return undefined;

    let cancelled = false;
    const refreshPlanning = async () => {
      if (cancelled || document.visibilityState === "hidden") return;

      const windowRange = recentSessionWindow();
      setIsSyncing(true);
      try {
        const sessions = await apiFetch(recentSessionsPath());
        if (cancelled || !Array.isArray(sessions)) return;
        setState((previous) => ({
          ...previous,
          sessions: mergeSessionWindow(previous.sessions, sessions, windowRange),
        }));
        setSyncMessage("Planning actualisé");
      } catch (error) {
        if (!cancelled) {
          setSyncMessage("Actualisation du planning impossible · données précédentes conservées");
          console.error(error);
        }
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshPlanning();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authUserId, setIsSyncing, setState, setSyncMessage, useApi]);

  useEffect(() => {
    if (!useApi || !authUserId) {
      setPendingBroadcastMessages([]);
      return undefined;
    }

    let isMounted = true;
    apiFetch("/auth/broadcast-messages/pending")
      .then((data) => {
        if (isMounted) setPendingBroadcastMessages(Array.isArray(data.messages) ? data.messages : []);
      })
      .catch((error) => {
        if (isMounted) setBroadcastMessageError(String(error.message || error));
      });

    return () => { isMounted = false; };
  }, [
    authUserId,
    setBroadcastMessageError,
    setPendingBroadcastMessages,
    useApi,
  ]);

  return { reloadApiState };
}
