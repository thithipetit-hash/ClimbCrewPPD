import { useCallback, useEffect } from "react";

import { apiFetch } from "../lib/api.js";
import {
  BUSINESS_BOOTSTRAP_ENDPOINTS,
  REALISATIONS_PAGE_SIZE,
  fetchPaginatedCollection,
  mergeBootstrapCollections,
  summarizeBootstrapResults,
} from "../lib/bootstrap-data.js";

function loadBootstrapEndpoint([key, path]) {
  if (key !== "realisations") return apiFetch(path);

  return fetchPaginatedCollection(
    ({ limit, offset }) => apiFetch(`${path}?limit=${limit}&offset=${offset}`),
    { pageSize: REALISATIONS_PAGE_SIZE },
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
  const reloadApiState = useCallback(async ({ isMounted = () => true } = {}) => {
    setIsSyncing(true);
    try {
      const settledResults = await Promise.allSettled(
        BUSINESS_BOOTSTRAP_ENDPOINTS.map(loadBootstrapEndpoint),
      );

      if (!isMounted()) return null;

      const summary = summarizeBootstrapResults(settledResults);
      setState((previous) => mergeBootstrapCollections(previous, settledResults));
      setSyncMessage(summary.failureCount ? "Données partiellement actualisées" : "Données actualisées");

      if (summary.allFailed) {
        throw summary.firstError || new Error("API indisponible");
      }

      return mergeBootstrapCollections({}, settledResults);
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

  useEffect(() => {
    if (!useApi) {
      setAuthLoading(false);
      return undefined;
    }

    let isMounted = true;
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
        await reloadApiState({ isMounted: () => isMounted }).catch(() => {});
      } catch {
        if (!isMounted) return;
        setAuthUser(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    reloadApiState,
    setAdminUnlocked,
    setAuthLoading,
    setAuthUser,
    setThemePreference,
    useApi,
  ]);

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
