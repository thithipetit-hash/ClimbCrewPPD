import { useCallback, useEffect } from "react";

import { apiFetch } from "../lib/api.js";

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
      const [participants, sessions, realisations, ropes, routes] = await Promise.all([
        apiFetch("/participants"),
        apiFetch("/sessions"),
        apiFetch("/realisations").catch(() => []),
        apiFetch("/ropes").catch(() => []),
        apiFetch("/routes").catch(() => []),
      ]);

      if (!isMounted()) return null;

      setState((prev) => ({
        ...prev,
        participants: Array.isArray(participants) ? participants : prev.participants,
        sessions: Array.isArray(sessions) && sessions.length ? sessions : prev.sessions,
        realisations: Array.isArray(realisations) ? realisations : prev.realisations,
        ropes: Array.isArray(ropes) && ropes.length ? ropes : prev.ropes,
        routes: Array.isArray(routes) && routes.length ? routes : prev.routes,
      }));

      setSyncMessage("Données actualisées");
      return { participants, sessions, realisations, ropes, routes };
    } catch (error) {
      if (isMounted()) {
        setSyncMessage("API indisponible · fallback local");
        console.error(error);
      }
      throw error;
    } finally {
      if (isMounted()) setIsSyncing(false);
    }
  }, [setIsSyncing, setState, setSyncMessage]);

  useEffect(() => {
    if (!useApi) return undefined;
    let mounted = true;
    reloadApiState({ isMounted: () => mounted }).catch(() => {});
    return () => { mounted = false; };
  }, [reloadApiState, useApi]);

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
